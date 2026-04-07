import { TaskStatus, normalizeTaskStatus } from "./task-core.js";

export type AgentAction = {
  tool: string;
  args: Record<string, any>;
};

export type RawAgentExecutionResponse = {
  thought?: string;
  actions?: AgentAction[];
  classification?: string;
  goal?: string;
  reply_proposal?: string;
  replyProposal?: string;
  memory_updates?: string[];
  memoryUpdates?: string[];
  clarification_needed?: boolean;
  clarificationNeeded?: boolean;
  risk_level?: "low" | "medium" | "high";
  riskLevel?: "low" | "medium" | "high";
  task_status?: string | null;
  taskStatus?: string | null;
};

export type StructuredExecutionDecision = {
  classification: string;
  goal: string;
  actions: AgentAction[];
  replyProposal: string | null;
  memoryUpdates: string[];
  clarificationNeeded: boolean;
  riskLevel: "low" | "medium" | "high";
  taskStatus: TaskStatus | null;
  reasoningSummary: string;
};

export function normalizeExecutionDecision(
  response: RawAgentExecutionResponse,
  defaults?: {
    classification?: string;
    goal?: string;
    riskLevel?: "low" | "medium" | "high";
  }
): StructuredExecutionDecision {
  const actions = Array.isArray(response.actions)
    ? response.actions.filter((action) => action && typeof action.tool === "string" && action.args && typeof action.args === "object")
    : [];
  const classification = cleanText(response.classification) ?? defaults?.classification ?? "task_progression";
  const goal = cleanText(response.goal) ?? inferGoal(actions) ?? defaults?.goal ?? "Choose the smallest useful next step.";
  const replyProposal = cleanText(response.replyProposal) ?? cleanText(response.reply_proposal) ?? null;
  const memoryUpdates = normalizeStringArray(response.memoryUpdates ?? response.memory_updates);
  const clarificationNeeded = Boolean(response.clarificationNeeded ?? response.clarification_needed);
  const riskLevel = normalizeRiskLevel(response.riskLevel ?? response.risk_level) ?? defaults?.riskLevel ?? "low";
  const taskStatus = normalizeTaskStatus(response.taskStatus ?? response.task_status);
  const reasoningSummary =
    cleanText(response.goal) ??
    cleanText(response.thought) ??
    inferReasoningSummary(actions, classification, riskLevel);

  return {
    classification,
    goal,
    actions,
    replyProposal,
    memoryUpdates,
    clarificationNeeded,
    riskLevel,
    taskStatus,
    reasoningSummary
  };
}

function cleanText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function normalizeRiskLevel(value: unknown): "low" | "medium" | "high" | null {
  if (value === "low" || value === "medium" || value === "high") {
    return value;
  }

  return null;
}

function inferGoal(actions: AgentAction[]): string | null {
  if (actions.length === 0) {
    return null;
  }

  if (actions.some((action) => action.tool === "send_whatsapp_message")) {
    return "Reach out to the relevant contact with the next useful update.";
  }

  if (actions.some((action) => action.tool === "schedule_wakeup")) {
    return "Schedule the next follow-up point so the task can continue later.";
  }

  if (actions.some((action) => action.tool === "update_task_status")) {
    return "Advance the task state to reflect the current situation.";
  }

  return "Take the smallest useful action to progress the task.";
}

function inferReasoningSummary(
  actions: AgentAction[],
  classification: string,
  riskLevel: "low" | "medium" | "high"
): string {
  if (actions.length === 0) {
    return `No action selected; classification=${classification}; risk=${riskLevel}.`;
  }

  return `Selected ${actions.length} action(s); classification=${classification}; risk=${riskLevel}.`;
}
