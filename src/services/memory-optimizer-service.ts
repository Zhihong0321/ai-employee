import { Repository } from "../database/repository.js";
import { LlmRouter } from "../llm/llm-router.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OptimizationResult = {
  taskId: number;
  skipped: boolean;
  skipReason?: string;
  summaryEventId?: number;
  archivedEventCount?: number;
  tier1FactsWritten?: number;
  memoryIndexEntriesWritten?: number;
  error?: string;
};

type LlmOptimizerOutput = {
  /** Concise narrative (≤ 400 words) of everything that happened on this task. */
  taskSummary: string;
  /** Agent's current understanding of next step. */
  nextStep: string | null;
  /** What is the task waiting on (if WAITING). */
  waitingFor: string | null;
  /** What is blocking progress (if BLOCKED). */
  blocker: string | null;
  /** Tier 1 behavioral facts extracted. Max 5. */
  tier1Facts: Array<{
    /** Unique key: "<subject>:<predicate>" e.g. "60123456789:contact_language" */
    factKey: string;
    subject: string;
    predicate: string;
    value: string;
    confidence: number;
  }>;
  /** Memory index entries for long-term search. Max 3. */
  memoryIndexEntries: Array<{
    memoryKey: string;
    memoryType: string;
    title: string;
    summary: string;
    tags: string[];
    entities: string[];
    importanceScore: number;
  }>;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * MemoryOptimizerService — SDMO Phase 2
 *
 * Distills a task's raw event log into:
 *   1. A TASK_SUMMARY event (replaces scroll of raw events in prompts)
 *   2. Tier 1 facts (behavioral rules, injected permanently into every prompt)
 *   3. Memory index entries (searchable via MCP on-demand query)
 *
 * Design rules (from SDMO-BUILD-PLAN.md):
 *   - Zero coupling to AgentRunner or intake pipeline.
 *   - Fully idempotent: safe to call multiple times on the same task.
 *   - Backward compatible: tasks never optimized work exactly as before.
 */
export class MemoryOptimizerService {
  constructor(
    private readonly repository: Repository,
    private readonly llmRouter: LlmRouter,
    private readonly options: {
      /** Model to use for optimizer. Default: router's configured model. */
      model?: string;
      /** Min events required before optimization is worthwhile. Default: 10 */
      minEventThreshold?: number;
      /** Skip if last_optimized_at < this many minutes ago. Default: 30 */
      cooldownMinutes?: number;
    } = {}
  ) {}

  /**
   * Main entry point. Runs the full optimization pipeline for a single task.
   * Returns a result object describing what happened (idempotent, never throws).
   */
  async runForTask(taskId: number): Promise<OptimizationResult> {
    try {
      return await this.optimize(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[MemoryOptimizer] Unexpected error for task ${taskId}:`, error);
      return { taskId, skipped: false, error: message };
    }
  }

  // ---------------------------------------------------------------------------
  // Private pipeline
  // ---------------------------------------------------------------------------

  private async optimize(taskId: number): Promise<OptimizationResult> {
    const minEvents = this.options.minEventThreshold ?? 10;
    const cooldownMinutes = this.options.cooldownMinutes ?? 30;

    // ── 1. Load task record ──────────────────────────────────────────────────
    const task = await this.repository.getTaskById(taskId);
    if (!task) {
      return { taskId, skipped: true, skipReason: "Task not found." };
    }

    // ── 2. Cooldown guard ────────────────────────────────────────────────────
    const lastOptimizedAt = task.last_optimized_at
      ? new Date(task.last_optimized_at as string)
      : null;

    if (lastOptimizedAt) {
      const minutesSince = (Date.now() - lastOptimizedAt.getTime()) / 60000;
      if (minutesSince < cooldownMinutes) {
        return {
          taskId,
          skipped: true,
          skipReason: `Cooldown active. Last optimized ${Math.round(minutesSince)}m ago (cooldown: ${cooldownMinutes}m).`
        };
      }
    }

    // ── 3. Load all events (raw — bypassing the summary filter) ─────────────
    // We need the unfiltered full history to distill it.
    const allEvents = await this.repository.getAllTaskEvents(taskId);

    if (allEvents.length < minEvents) {
      return {
        taskId,
        skipped: true,
        skipReason: `Only ${allEvents.length} events (threshold: ${minEvents}). Not enough to optimize.`
      };
    }

    // ── 4. Call LLM for distillation ─────────────────────────────────────────
    const llmOutput = await this.callDistillationLlm(task, allEvents);

    // ── 5. Write TASK_SUMMARY event ──────────────────────────────────────────
    await this.repository.addTaskEvent(taskId, "TASK_SUMMARY", {
      summary: llmOutput.taskSummary,
      eventCountDistilled: allEvents.length,
      generatedAt: new Date().toISOString(),
      nextStep: llmOutput.nextStep,
      waitingFor: llmOutput.waitingFor,
      blocker: llmOutput.blocker
    });

    // Fetch the event we just wrote so we have its ID for archiving
    const summaryEventRow = await this.repository.getLatestTaskSummaryEvent(taskId);
    const summaryEventId = summaryEventRow?.id as number | undefined;

    // ── 6. Archive old events ────────────────────────────────────────────────
    let archivedCount = 0;
    if (summaryEventId) {
      archivedCount = await this.repository.archiveTaskEventsBeforeId(taskId, summaryEventId);
    }

    // ── 7. Update task snapshot with optimizer's narrative ──────────────────
    await this.repository.updateTaskSnapshot({
      taskId,
      currentSummary: llmOutput.taskSummary,
      nextStep: llmOutput.nextStep ?? undefined,
      waitingFor: llmOutput.waitingFor ?? undefined,
      blocker: llmOutput.blocker ?? undefined
    });

    // ── 8. Write Tier 1 facts ────────────────────────────────────────────────
    let tier1FactsWritten = 0;
    for (const fact of llmOutput.tier1Facts.slice(0, 5)) {
      await this.repository.upsertFact({
        factKey: fact.factKey,
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        status: "confirmed",
        confidence: fact.confidence,
        memoryTier: 1,
        metadata: { source: "sdmo_optimizer", taskId }
      });
      tier1FactsWritten++;
    }

    // ── 9. Write memory index entries ────────────────────────────────────────
    let memoryIndexEntriesWritten = 0;
    for (const entry of llmOutput.memoryIndexEntries.slice(0, 3)) {
      await this.repository.upsertMemoryIndex({
        memoryKey: entry.memoryKey,
        memoryType: entry.memoryType,
        scopeType: task.target_number ? "contact" : "global",
        scopeId: task.target_number ?? null,
        title: entry.title,
        summary: entry.summary,
        sourceTable: "task_events",
        sourceRef: String(taskId),
        tags: entry.tags,
        entities: entry.entities,
        importanceScore: entry.importanceScore,
        freshnessScore: 0.9,
        confidence: 0.85,
        metadata: { source: "sdmo_optimizer", taskId }
      });
      memoryIndexEntriesWritten++;
    }

    // ── 10. Update task optimization metadata ────────────────────────────────
    await this.repository.setTaskOptimizationMeta(taskId);

    console.log(
      `[MemoryOptimizer] Task ${taskId}: archived ${archivedCount} events, ` +
      `wrote ${tier1FactsWritten} Tier 1 facts, ${memoryIndexEntriesWritten} memory index entries.`
    );

    return {
      taskId,
      skipped: false,
      summaryEventId,
      archivedEventCount: archivedCount,
      tier1FactsWritten,
      memoryIndexEntriesWritten
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** Build the LLM prompt and parse the structured JSON output. */
  private async callDistillationLlm(task: any, events: any[]): Promise<LlmOptimizerOutput> {
    const eventText = events
      .map((e: any) => {
        const contentStr = typeof e.content === "object"
          ? JSON.stringify(e.content)
          : String(e.content ?? "");
        return `[${e.event_type}] ${new Date(e.created_at).toISOString()}\n${contentStr}`;
      })
      .join("\n\n---\n\n");

    const systemPrompt = `You are the Memory Optimizer for an AI agent. Your job is to distill a task's raw event log into dense, structured memory artifacts that the agent can use in future interactions.

OUTPUT RULES:
- Be concise and factual. No speculation.
- tier1Facts: Only behavioral rules that must ALWAYS be respected (contact preferences, language, constraints). Max 5. If none exist, return empty array.
- memoryIndexEntries: Searchable summaries useful for future retrieval. Max 3.
- Return valid JSON only. No markdown, no explanation.`;

    const schemaDescription = `{
  "taskSummary": "string (≤400 words): Full narrative of everything that happened, current state, and outcome",
  "nextStep": "string | null: What should the agent do next if the task resumes",
  "waitingFor": "string | null: What external event is the task waiting on (if applicable)",
  "blocker": "string | null: What is preventing progress (if applicable)",
  "tier1Facts": [
    {
      "factKey": "string: '<subject>:<predicate>' e.g. '60123456789:preferred_language'",
      "subject": "string: whatsapp_number or domain key",
      "predicate": "string: short camelCase key e.g. 'preferred_language'",
      "value": "string: the fact value",
      "confidence": "number: 0.0-1.0"
    }
  ],
  "memoryIndexEntries": [
    {
      "memoryKey": "string: unique key e.g. 'task_42_outcome'",
      "memoryType": "string: one of 'task_outcome' | 'contact_insight' | 'policy_rule' | 'event_summary'",
      "title": "string: short title ≤80 chars",
      "summary": "string: ≤200 word searchable summary",
      "tags": ["string"],
      "entities": ["string: phone numbers, names, domain keywords"],
      "importanceScore": "number: 0.0-1.0"
    }
  ]
}`;

    const prompt = `TASK:
ID: ${task.id}
Title: ${task.title}
Status: ${task.status}
Requested by: ${task.requested_by ?? "unknown"}
Target: ${task.target_number ?? "unknown"}
Created: ${task.created_at}

ORIGINAL INTENT (charter):
${JSON.stringify(task.charter ?? {}, null, 2)}

CURRENT SNAPSHOT:
${JSON.stringify(task.snapshot ?? {}, null, 2)}

EVENT LOG (${events.length} events):
${eventText}

Distill the above into the required JSON structure.`;

    const output = await this.llmRouter.generateJson<LlmOptimizerOutput>({
      systemPrompt,
      prompt,
      model: this.options.model,
      temperature: 0.1,
      schemaDescription,
      traceMetadata: { callType: "sdmo_optimizer", sourceTaskId: String(task.id) }
    });

    return this.sanitizeOutput(output);
  }

  /** Defensive sanitization of LLM output. */
  private sanitizeOutput(raw: any): LlmOptimizerOutput {
    return {
      taskSummary: String(raw?.taskSummary ?? "No summary generated.").slice(0, 3000),
      nextStep: raw?.nextStep ? String(raw.nextStep).slice(0, 500) : null,
      waitingFor: raw?.waitingFor ? String(raw.waitingFor).slice(0, 500) : null,
      blocker: raw?.blocker ? String(raw.blocker).slice(0, 500) : null,
      tier1Facts: Array.isArray(raw?.tier1Facts)
        ? raw.tier1Facts
            .filter((f: any) => f?.factKey && f?.predicate && f?.value)
            .map((f: any) => ({
              factKey: String(f.factKey),
              subject: String(f.subject ?? ""),
              predicate: String(f.predicate),
              value: String(f.value),
              confidence: Math.min(1, Math.max(0, Number(f.confidence ?? 0.8)))
            }))
        : [],
      memoryIndexEntries: Array.isArray(raw?.memoryIndexEntries)
        ? raw.memoryIndexEntries
            .filter((e: any) => e?.memoryKey && e?.title && e?.summary)
            .map((e: any) => ({
              memoryKey: String(e.memoryKey),
              memoryType: String(e.memoryType ?? "event_summary"),
              title: String(e.title).slice(0, 200),
              summary: String(e.summary).slice(0, 1000),
              tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
              entities: Array.isArray(e.entities) ? e.entities.map(String) : [],
              importanceScore: Math.min(1, Math.max(0, Number(e.importanceScore ?? 0.6)))
            }))
        : []
    };
  }
}
