import { Repository } from "../database/repository.js";
import { DebugService } from "../debug/debug-service.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { AgentPolicyEngine } from "./policy-core.js";
import { buildTaskCharter, buildTaskSnapshot } from "./task-core.js";

export type AgentMessenger = {
  sendText: (targetNumber: string, text: string) => Promise<unknown>;
};

export class AgentToolExecutor {
  private messenger?: AgentMessenger;

  constructor(
    private readonly repository: Repository,
    private readonly debugService: DebugService,
    private readonly policyEngine: AgentPolicyEngine
  ) {}

  setMessenger(messenger: AgentMessenger): void {
    this.messenger = messenger;
  }

  async executeAll(actions: Array<{ tool: string; args: Record<string, any> }>, contextTaskId?: number): Promise<Array<{ tool: string, result: string }>> {
    const runId = this.debugService.createRunId("tool_exec");
    const results = [];
    for (const action of actions) {
      const result = await this.execute(action.tool, action.args, contextTaskId, runId);
      results.push({ tool: action.tool, result });
    }
    return results;
  }

  async execute(toolName: string, args: Record<string, any>, contextTaskId?: number, runId?: string): Promise<string> {
    try {
      const policyDecision = await this.policyEngine.validateToolAction({
        toolName,
        args,
        contextTaskId
      });

      await this.debugService.log({
        runId,
        taskId: contextTaskId ?? null,
        stage: "policy_validation",
        toolName,
        summary: `Policy engine returned ${policyDecision.outcome} for tool execution`,
        payload: {
          reason: policyDecision.reason,
          note: policyDecision.note,
          riskLevel: policyDecision.metadata.riskLevel,
          sideEffectType: policyDecision.metadata.sideEffectType
        },
        requiredMode: "debug_basic"
      });

      if (policyDecision.outcome === "deny" || policyDecision.outcome === "handoff_required") {
        if (contextTaskId) {
          await this.repository.addTaskEvent(contextTaskId, policyDecision.outcome === "deny" ? "POLICY_DENY" : "HANDOFF_REQUIRED", {
            action: toolName,
            reason: policyDecision.reason,
            note: policyDecision.note ?? null,
            attemptedArgs: args
          });
        }

        return `Error: ${policyDecision.reason}.`;
      }

      const normalizedArgs = policyDecision.normalizedArgs;

      await this.debugService.log({
        runId,
        taskId: contextTaskId ?? null,
        stage: "action_execution",
        toolName,
        summary: "Executing agent tool",
        payload: {
          args: normalizedArgs
        },
        requiredMode: "debug_verbose"
      });
      switch (toolName) {
        case "update_task_status":
          return await this.updateTaskStatus(normalizedArgs);
        case "send_whatsapp_message":
          return await this.sendWhatsappMessage(normalizedArgs, contextTaskId, runId);
        case "create_task":
          return await this.createTask(normalizedArgs, contextTaskId);
        case "schedule_wakeup":
          return await this.scheduleWakeup(normalizedArgs);
        default:
          return `Error: Unknown tool ${toolName}`;
      }
    } catch (error) {
      await this.debugService.log({
        runId,
        taskId: contextTaskId ?? null,
        stage: "action_execution",
        toolName,
        summary: "Agent tool execution failed",
        payload: {
          error: error instanceof Error ? error.message : String(error),
          args
        },
        severity: "error",
        force: true
      });
      return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private async updateTaskStatus(args: Record<string, any>): Promise<string> {
    const { task_id, status, event_note } = args;
    if (!task_id || !status) return "Error: missing required arguments task_id or status";

    await this.repository.updateTaskStatus(task_id, status);
    await this.repository.updateTaskSnapshot({
      taskId: Number(task_id),
      status,
      currentSummary: event_note,
      blocker: status === "BLOCKED" ? event_note : null,
      waitingFor: status === "WAITING" ? event_note : null
    });
    await this.repository.addTaskEvent(task_id, "STATUS_CHANGE", { status, note: event_note });

    return `Task ${task_id} updated to ${status}.`;
  }

  private async sendWhatsappMessage(args: Record<string, any>, contextTaskId?: number, runId?: string): Promise<string> {
    const { target_number, message } = args;
    if (!target_number || !message) return "Error: missing required arguments target_number or message";
    const normalizedTargetNumber = normalizePhoneNumber(target_number);

    if (this.messenger) {
      await this.messenger.sendText(normalizedTargetNumber, message);
    } else {
      console.warn(`[AgentToolExecutor] Messenger not attached, cannot send to ${normalizedTargetNumber}: ${message}`);
    }

    await this.debugService.log({
      runId,
      taskId: contextTaskId ?? null,
      toolName: "send_whatsapp_message",
      stage: "tool_call",
      summary: "Tool dispatched WhatsApp message",
      payload: {
        targetNumber: normalizedTargetNumber,
        messageCharacters: message.length
      },
      requiredMode: "debug_basic"
    });

    if (contextTaskId) {
      await this.repository.addTaskEvent(contextTaskId, "TOOL_CALL", { 
        action: "send_whatsapp_message", 
        target: normalizedTargetNumber, 
        message 
      });
    }

    return `Message dispatched to ${normalizedTargetNumber}.`;
  }

  private async createTask(args: Record<string, any>, parentTaskId?: number): Promise<string> {
    const { title, details, target_number, due_at } = args;
    if (!title || !details) return "Error: missing required arguments title or details";
    let requesterNumber: string | null = null;
    let timezone: string | null = null;
    let timezoneSource: string | null = null;

    if (parentTaskId) {
      const parentTask = await this.repository.getTaskById(parentTaskId);
      requesterNumber = parentTask?.requested_by ?? null;
      timezone = parentTask?.timezone ?? parentTask?.charter?.timeContext?.timezone ?? null;
      timezoneSource = parentTask?.timezone_source ?? parentTask?.charter?.timeContext?.timezoneSource ?? null;
    }

    const newTaskId = await this.repository.addTask({
      title,
      details,
      requestedBy: requesterNumber,
      targetNumber: target_number,
      dueAt: due_at,
      timezone,
      timezoneSource,
      charter: buildTaskCharter({
        originalIntent: details,
        requesterNumber,
        targetNumber: target_number ?? null,
        constraints: parentTaskId ? { parentTaskId } : {},
        timezone,
        timezoneSource
      }),
      snapshot: buildTaskSnapshot({
        status: "TODO",
        currentSummary: details,
        nextStep: due_at ? "Wait until the scheduled follow-up time." : "Decide the first concrete action."
      }),
      metadata: parentTaskId ? { parentTaskId } : {}
    });

    if (parentTaskId) {
      await this.repository.addTaskEvent(parentTaskId, "TASK_CREATED", {
        note: `Created sub-task #${newTaskId}: ${title}`
      });
    }

    return `Successfully created Task #${newTaskId}.`;
  }

  private async scheduleWakeup(args: Record<string, any>): Promise<string> {
    const { task_id, run_at, reason } = args;
    if (!task_id || !run_at || !reason) return "Error: missing required arguments task_id, run_at, or reason";
    const task = await this.repository.getTaskById(Number(task_id));

    await this.repository.addScheduledJob({
      jobType: "agent-wakeup",
      runAt: run_at,
      sourceTaskId: task_id,
      payload: { reason },
      idempotencyKey: `agent-wakeup:${task_id}:${run_at}:${reason}`,
      timezoneContext: task?.charter?.timeContext ?? {},
      retryLimit: 3
    });

    await this.repository.updateTaskSnapshot({
      taskId: Number(task_id),
      status: task?.status ?? "WAITING",
      currentSummary: task?.snapshot?.currentSummary ?? task?.details ?? reason,
      nextStep: `Wake up at ${run_at} and continue the task.`,
      waitingFor: reason,
      latestKnownContext: {
        scheduledWakeupAt: run_at
      }
    });
    await this.repository.addTaskEvent(task_id, "TOOL_CALL", { 
      action: "schedule_wakeup", 
      runAt: run_at, 
      reason 
    });

    return `Wakeup scheduled for task ${task_id} at ${run_at} UTC.`;
  }
}
