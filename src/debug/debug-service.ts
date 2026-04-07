import crypto from "node:crypto";
import { Repository } from "../database/repository.js";
import { DebugConfig, DebugMode, DebugSeverity, DebugStage } from "./types.js";

const DEBUG_MODE_RANK: Record<DebugMode, number> = {
  debug_off: 0,
  debug_basic: 1,
  debug_verbose: 2,
  debug_trace: 3
};

export type DebugLogInput = {
  runId?: string | null;
  taskId?: number | null;
  messageExternalId?: string | null;
  schedulerJobId?: number | null;
  toolName?: string | null;
  severity?: DebugSeverity;
  stage: DebugStage;
  summary: string;
  payload?: Record<string, unknown>;
  requiredMode?: DebugMode;
  force?: boolean;
};

export function formatDebugStageLabel(stage: DebugStage): string {
  return stage.replaceAll("_", " ");
}

export class DebugService {
  private cachedConfig?: DebugConfig;
  private cachedAt = 0;

  constructor(private readonly repository: Repository) {}

  async getConfig(forceRefresh = false): Promise<DebugConfig> {
    const now = Date.now();
    if (!forceRefresh && this.cachedConfig && now - this.cachedAt < 2_000) {
      return this.cachedConfig;
    }

    const config = await this.repository.getDebugConfig();
    this.cachedConfig = config;
    this.cachedAt = now;
    return config;
  }

  async updateConfig(config: DebugConfig): Promise<void> {
    await this.repository.saveDebugConfig(config);
    this.cachedConfig = config;
    this.cachedAt = Date.now();
  }

  createRunId(prefix: string): string {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  }

  shouldLog(input: Pick<DebugLogInput, "severity" | "taskId" | "toolName" | "requiredMode" | "force">, config: DebugConfig): boolean {
    if (input.force) {
      return true;
    }

    const severity = input.severity ?? "info";
    const requiredMode = input.requiredMode ?? (severity === "error" ? "debug_basic" : "debug_verbose");
    const allowedByMode = DEBUG_MODE_RANK[config.mode] >= DEBUG_MODE_RANK[requiredMode];
    const allowedByTask = typeof input.taskId === "number" && config.enabledTaskIds.includes(input.taskId);
    const allowedByTool = Boolean(input.toolName && config.enabledToolNames.includes(input.toolName));

    return allowedByMode || allowedByTask || allowedByTool;
  }

  async log(input: DebugLogInput): Promise<void> {
    const severity = input.severity ?? "info";
    const config = await this.getConfig();

    if (!this.shouldLog(input, config)) {
      return;
    }

    const payload: Record<string, unknown> = { ...(input.payload ?? {}) };
    if (!config.promptTrace) {
      delete payload.prompt;
      delete payload.systemPrompt;
      delete payload.schemaDescription;
      delete payload.promptTrace;
    }
    if (!config.apiPayloadTrace) {
      delete payload.apiPayload;
      delete payload.rawPayload;
      delete payload.toolOutputs;
    }

    await this.repository.addDebugRecord({
      runId: input.runId ?? null,
      taskId: input.taskId ?? null,
      messageExternalId: input.messageExternalId ?? null,
      schedulerJobId: input.schedulerJobId ?? null,
      toolName: input.toolName ?? null,
      severity,
      stage: input.stage,
      summary: input.summary,
      payload
    });
  }
}
