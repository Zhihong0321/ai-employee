import { Repository } from "../database/repository.js";
import { MemoryOptimizerService } from "./memory-optimizer-service.js";
import { DebugService } from "../debug/debug-service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WatcherOptions = {
  /** Tokens-per-call that triggers optimization. Reads from config. */
  tokenThreshold: number;
  /** How often the watcher polls (ms). Default: 5 minutes. */
  pollIntervalMs?: number;
  /** How far back to scan llm_call_logs each poll cycle (minutes). Default: 65 min — slightly over one poll cycle. */
  lookbackMinutes?: number;
  /** Min minutes between optimizer runs per task. Passed through to optimizer. Default: 30. */
  optimizerCooldownMinutes?: number;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * TokenThresholdWatcher — SDMO Phase 3
 *
 * Polls `llm_call_logs` on a configurable interval and fires the
 * MemoryOptimizerService whenever a single LLM call for a known task
 * has exceeded `tokenThreshold` tokens.
 *
 * Design rules (from SDMO-BUILD-PLAN.md):
 *   - Zero coupling to AgentRunner or the intake pipeline.
 *   - Runs as a sibling to SchedulerService — started from index.ts.
 *   - Every trigger is logged to debug_records for observability.
 *   - Fully idempotent: if optimizer already ran recently, it will skip
 *     (cooldown guard lives inside MemoryOptimizerService).
 */
export class TokenThresholdWatcher {
  private intervalHandle?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly repository: Repository,
    private readonly optimizer: MemoryOptimizerService,
    private readonly debugService: DebugService,
    private readonly options: WatcherOptions
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    if (this.intervalHandle) {
      return; // Already running.
    }

    const pollMs = this.options.pollIntervalMs ?? 5 * 60 * 1000; // 5 min
    this.intervalHandle = setInterval(() => {
      void this.poll();
    }, pollMs);

    console.log(
      `[TokenThresholdWatcher] Started. Threshold: ${this.options.tokenThreshold} tokens. ` +
      `Poll interval: ${pollMs / 1000}s.`
    );
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      console.log("[TokenThresholdWatcher] Stopped.");
    }
  }

  // ---------------------------------------------------------------------------
  // Poll cycle
  // ---------------------------------------------------------------------------

  /**
   * One poll cycle: find breaching tasks, fire optimizer for each.
   * Called automatically on interval; also exposed for manual testing.
   */
  async poll(): Promise<void> {
    if (this.isRunning) {
      // Previous cycle still in progress — skip to avoid pile-up.
      return;
    }

    this.isRunning = true;
    const runId = this.debugService.createRunId("sdmo_watcher");

    try {
      const taskIds = await this.repository.findThresholdBreachingTaskIds({
        tokenThreshold: this.options.tokenThreshold,
        lookbackMinutes: this.options.lookbackMinutes ?? 65,
        limit: 20
      });

      if (taskIds.length === 0) {
        return; // Nothing to do this cycle.
      }

      await this.debugService.log({
        runId,
        stage: "optimization",
        summary: `[SDMO Watcher] Found ${taskIds.length} task(s) exceeding threshold`,
        payload: {
          tokenThreshold: this.options.tokenThreshold,
          taskIds
        },
        force: true
      });

      for (const taskId of taskIds) {
        await this.runOptimizerForTask(taskId, runId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[TokenThresholdWatcher] Poll cycle error:", error);

      await this.safeLog({
        runId,
        stage: "optimization",
        summary: "[SDMO Watcher] Poll cycle threw an unexpected error",
        payload: { error: message },
        severity: "error",
        force: true
      });
    } finally {
      this.isRunning = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async runOptimizerForTask(taskId: number, runId: string): Promise<void> {
    try {
      await this.safeLog({
        runId,
        taskId,
        stage: "optimization",
        summary: `[SDMO Watcher] Triggering optimizer for task ${taskId}`,
        payload: { taskId, threshold: this.options.tokenThreshold },
        force: true
      });

      const result = await this.optimizer.runForTask(taskId);

      if (result.skipped) {
        await this.safeLog({
          runId,
          taskId,
          stage: "optimization",
          summary: `[SDMO Watcher] Optimizer skipped task ${taskId}: ${result.skipReason}`,
          payload: result,
          force: false
        });
        return;
      }

      if (result.error) {
        await this.safeLog({
          runId,
          taskId,
          stage: "optimization",
          summary: `[SDMO Watcher] Optimizer error on task ${taskId}: ${result.error}`,
          payload: result,
          severity: "error",
          force: true
        });
        return;
      }

      await this.safeLog({
        runId,
        taskId,
        stage: "optimization",
        summary: `[SDMO Watcher] Optimizer succeeded for task ${taskId}`,
        payload: {
          archivedEventCount: result.archivedEventCount,
          tier1FactsWritten: result.tier1FactsWritten,
          memoryIndexEntriesWritten: result.memoryIndexEntriesWritten
        },
        force: true
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[TokenThresholdWatcher] Unexpected error optimizing task ${taskId}:`, error);

      await this.safeLog({
        runId,
        taskId,
        stage: "optimization",
        summary: `[SDMO Watcher] Unexpected error for task ${taskId}`,
        payload: { error: message },
        severity: "error",
        force: true
      });
    }
  }

  private async safeLog(input: {
    runId: string;
    taskId?: number;
    stage: "optimization";
    summary: string;
    payload?: Record<string, unknown>;
    severity?: "info" | "warn" | "error";
    force: boolean;
  }): Promise<void> {
    try {
      await this.debugService.log({
        runId: input.runId,
        taskId: input.taskId ?? null,
        stage: input.stage,
        summary: input.summary,
        payload: input.payload,
        severity: input.severity,
        force: input.force
      });
    } catch {
      // Silent — never let logging failures break the watcher.
    }
  }
}
