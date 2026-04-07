import { Repository } from "../database/repository.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { normalizeTaskStatus } from "./task-core.js";

export type ToolRiskLevel = "read" | "low" | "medium" | "high";
export type ToolSideEffectType = "read" | "state_write" | "external_outreach" | "scheduler";
export type ToolRetryClass = "safe" | "idempotent" | "manual_review";
export type ToolPolicyOutcome = "allow" | "allow_with_note" | "deny" | "handoff_required";

export type ToolPolicyDecision = {
  outcome: ToolPolicyOutcome;
  reason: string;
  normalizedArgs: Record<string, any>;
  metadata: AgentToolPolicySpec;
  note?: string;
};

export type AgentToolPolicySpec = {
  name: string;
  requiredArgs: string[];
  riskLevel: ToolRiskLevel;
  sideEffectType: ToolSideEffectType;
  retryClass: ToolRetryClass;
  idempotent: boolean;
};

export const AGENT_TOOL_POLICY_CATALOG: Record<string, AgentToolPolicySpec> = {
  update_task_status: {
    name: "update_task_status",
    requiredArgs: ["task_id", "status", "event_note"],
    riskLevel: "low",
    sideEffectType: "state_write",
    retryClass: "idempotent",
    idempotent: true
  },
  send_whatsapp_message: {
    name: "send_whatsapp_message",
    requiredArgs: ["target_number", "message"],
    riskLevel: "medium",
    sideEffectType: "external_outreach",
    retryClass: "manual_review",
    idempotent: false
  },
  create_task: {
    name: "create_task",
    requiredArgs: ["title", "details"],
    riskLevel: "low",
    sideEffectType: "state_write",
    retryClass: "idempotent",
    idempotent: true
  },
  schedule_wakeup: {
    name: "schedule_wakeup",
    requiredArgs: ["task_id", "run_at", "reason"],
    riskLevel: "low",
    sideEffectType: "scheduler",
    retryClass: "safe",
    idempotent: true
  }
};

export class AgentPolicyEngine {
  constructor(private readonly repository: Repository) {}

  async validateToolAction(input: {
    toolName: string;
    args: Record<string, any>;
    contextTaskId?: number;
  }): Promise<ToolPolicyDecision> {
    const metadata = AGENT_TOOL_POLICY_CATALOG[input.toolName];
    if (!metadata) {
      return {
        outcome: "deny",
        reason: "unknown_tool",
        normalizedArgs: input.args,
        metadata: {
          name: input.toolName,
          requiredArgs: [],
          riskLevel: "high",
          sideEffectType: "state_write",
          retryClass: "manual_review",
          idempotent: false
        }
      };
    }

    const missingArgs = metadata.requiredArgs.filter((key) => isMissingArg(input.args[key]));
    if (missingArgs.length > 0) {
      return {
        outcome: "deny",
        reason: `missing_required_args:${missingArgs.join(",")}`,
        normalizedArgs: input.args,
        metadata
      };
    }

    switch (input.toolName) {
      case "update_task_status":
        return this.validateTaskStatusUpdate(input.args, metadata, input.contextTaskId);
      case "send_whatsapp_message":
        return this.validateWhatsappSend(input.args, metadata);
      case "create_task":
        return this.validateTaskCreation(input.args, metadata);
      case "schedule_wakeup":
        return this.validateWakeupSchedule(input.args, metadata, input.contextTaskId);
      default:
        return {
          outcome: "allow",
          reason: "validated",
          normalizedArgs: input.args,
          metadata
        };
    }
  }

  private async validateTaskStatusUpdate(
    args: Record<string, any>,
    metadata: AgentToolPolicySpec,
    contextTaskId?: number
  ): Promise<ToolPolicyDecision> {
    const taskId = Number(args.task_id);
    const normalizedStatus = normalizeTaskStatus(args.status);
    if (!Number.isFinite(taskId) || !normalizedStatus) {
      return {
        outcome: "deny",
        reason: "invalid_task_status_args",
        normalizedArgs: args,
        metadata
      };
    }

    const task = await this.repository.getTaskById(taskId);
    if (!task) {
      return {
        outcome: "deny",
        reason: "task_not_found",
        normalizedArgs: args,
        metadata
      };
    }

    const note = typeof contextTaskId === "number" && contextTaskId !== taskId ? "cross-task status update" : undefined;
    return {
      outcome: note ? "allow_with_note" : "allow",
      reason: "validated",
      normalizedArgs: {
        ...args,
        task_id: taskId,
        status: normalizedStatus
      },
      metadata,
      note
    };
  }

  private async validateWhatsappSend(args: Record<string, any>, metadata: AgentToolPolicySpec): Promise<ToolPolicyDecision> {
    const normalizedTargetNumber = normalizePhoneNumber(String(args.target_number ?? ""));
    const message = String(args.message ?? "").trim();
    if (!normalizedTargetNumber || !message) {
      return {
        outcome: "deny",
        reason: "invalid_send_args",
        normalizedArgs: args,
        metadata
      };
    }

    const allowed = await this.repository.canAutonomouslyReachContact(normalizedTargetNumber);
    if (!allowed) {
      return {
        outcome: "handoff_required",
        reason: "autonomous_outreach_not_allowed",
        normalizedArgs: {
          ...args,
          target_number: normalizedTargetNumber,
          message
        },
        metadata
      };
    }

    return {
      outcome: "allow",
      reason: "validated",
      normalizedArgs: {
        ...args,
        target_number: normalizedTargetNumber,
        message
      },
      metadata
    };
  }

  private async validateTaskCreation(args: Record<string, any>, metadata: AgentToolPolicySpec): Promise<ToolPolicyDecision> {
    const title = String(args.title ?? "").trim();
    const details = String(args.details ?? "").trim();
    if (!title || !details) {
      return {
        outcome: "deny",
        reason: "invalid_task_creation_args",
        normalizedArgs: args,
        metadata
      };
    }

    const dueAt = args.due_at ? new Date(String(args.due_at)) : null;
    if (args.due_at && Number.isNaN(dueAt?.getTime())) {
      return {
        outcome: "deny",
        reason: "invalid_due_at",
        normalizedArgs: args,
        metadata
      };
    }

    return {
      outcome: "allow",
      reason: "validated",
      normalizedArgs: {
        ...args,
        title,
        details,
        target_number: args.target_number ? normalizePhoneNumber(String(args.target_number)) : null,
        due_at: dueAt ? dueAt.toISOString() : null
      },
      metadata
    };
  }

  private async validateWakeupSchedule(
    args: Record<string, any>,
    metadata: AgentToolPolicySpec,
    contextTaskId?: number
  ): Promise<ToolPolicyDecision> {
    const taskId = Number(args.task_id);
    const runAt = new Date(String(args.run_at ?? ""));
    const reason = String(args.reason ?? "").trim();
    if (!Number.isFinite(taskId) || Number.isNaN(runAt.getTime()) || !reason) {
      return {
        outcome: "deny",
        reason: "invalid_schedule_args",
        normalizedArgs: args,
        metadata
      };
    }

    const task = await this.repository.getTaskById(taskId);
    if (!task) {
      return {
        outcome: "deny",
        reason: "task_not_found",
        normalizedArgs: args,
        metadata
      };
    }

    const note = typeof contextTaskId === "number" && contextTaskId !== taskId ? "cross-task wakeup scheduling" : undefined;
    return {
      outcome: note ? "allow_with_note" : "allow",
      reason: "validated",
      normalizedArgs: {
        ...args,
        task_id: taskId,
        run_at: runAt.toISOString(),
        reason
      },
      metadata,
      note
    };
  }
}

function isMissingArg(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim().length === 0;
  }

  return false;
}
