import { LlmRouter } from "../llm/llm-router.js";
import { Repository } from "../database/repository.js";
import { AgentToolExecutor } from "./executor.js";
import { ALL_AGENT_TOOLS } from "./tools.js";
import { InboundMessage } from "../types.js";
import { buildNormalizedMessageText } from "./intake.js";
import { PromptRegistry } from "../prompts/prompt-registry.js";
import { DebugService } from "../debug/debug-service.js";
import { SkillSelector } from "../skills/skill-selector.js";
import { AGENT_ABILITY_BOUNDARY_POLICY, buildAgentAbilityProfile } from "../lib/agent-ability.js";
import { appendTimeContextInstruction, buildPromptTimeContext } from "../lib/time-context.js";
import { RawAgentExecutionResponse, normalizeExecutionDecision } from "./execution-decision.js";
import { MemoryBrowserService } from "../services/memory-browser-service.js";
import { AgentIdentityService } from "../services/agent-identity-service.js";

export class AgentRunner {
  constructor(
    private readonly llmRouter: LlmRouter,
    private readonly repository: Repository,
    private readonly executor: AgentToolExecutor,
    private readonly promptRegistry: PromptRegistry,
    private readonly debugService: DebugService,
    private readonly skillSelector: SkillSelector,
    private readonly memoryBrowser: MemoryBrowserService,
    private readonly agentIdentityService: AgentIdentityService
  ) {}

  async handleInboundMessage(message: InboundMessage): Promise<void> {
    const runId = this.debugService.createRunId("agent_runner_msg");
    const senderNumber = message.senderNumber;
    const normalizedText = buildNormalizedMessageText(message);
    const agentIdentity = await this.agentIdentityService.getIdentity();
    
    // Gather state
    const profile = await this.repository.getContactByNumber(senderNumber);
    const recentContext = await this.repository.getRecentContext(senderNumber);
    const memoryEvidence = await this.memoryBrowser.buildInboundEvidencePack(message);
    // TODO: Ideally we retrieve ALL tasks related to this number, but for MVP we fetch tasks they own or are assigned to
    const activeTasks = await this.repository.getTasksByTarget(senderNumber); 
    const skillSelection = await this.skillSelector.selectForInbound({
      normalizedText,
      senderProfile: profile,
      recentContext
    });
    const promptPack = await this.promptRegistry.getActivePromptPack("agent-inbound-decision");

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "planning",
      summary: "AgentRunner preparing inbound decision",
      payload: {
        senderNumber,
        activeTaskCount: activeTasks.length,
        evidenceMemoryCount: memoryEvidence.relevantMemories.length,
        promptKey: promptPack.promptKey,
        promptVersionHash: promptPack.versionHash,
        selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
      },
      requiredMode: "debug_basic"
    });

    const timeContext = buildPromptTimeContext(profile);
    const abilityProfile = buildAgentAbilityProfile();
    const systemPrompt = appendTimeContextInstruction(`${promptPack.systemPrompt}

Current bot name: ${agentIdentity.name}
Current bot role: ${agentIdentity.roleDescription}

${AGENT_ABILITY_BOUNDARY_POLICY}`);

    const userPrompt = JSON.stringify(
      {
        timeContext,
        abilityProfile,
        senderName: message.senderName || senderNumber,
        normalizedText,
        senderProfile: profile,
        recentContext,
        memoryEvidence,
        activeTasks,
        selectedSkills: skillSelection.selectedSkills,
        availableTools: ALL_AGENT_TOOLS,
        instruction: "Choose the next state transition or action required."
      },
      null,
      2
    );

    try {
      const response = await this.llmRouter.generateJson<RawAgentExecutionResponse>({
        systemPrompt,
        prompt: userPrompt,
        schemaDescription: promptPack.schemaDescription,
        traceMetadata: {
          promptKey: promptPack.promptKey,
          manifestName: promptPack.manifestName,
          promptVersion: promptPack.version,
          promptVersionHash: promptPack.versionHash
        }
      });

      const decision = normalizeExecutionDecision(response, {
        classification: "inbound_message",
        goal: "Choose the next state transition or action required.",
        riskLevel: "low"
      });

      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "planning",
        summary: "AgentRunner produced inbound action decision",
        payload: {
          actionCount: decision.actions.length,
          classification: decision.classification,
          goal: decision.goal,
          riskLevel: decision.riskLevel,
          clarificationNeeded: decision.clarificationNeeded
        },
        requiredMode: "debug_verbose"
      });

      await this.repository.addDecisionLog(message.externalId, "agent_reasoning", "Agent decided on actions", {
        inboundText: message.text,
        normalizedText,
        selectedSkills: skillSelection.selectedSkills,
        consideredSkills: skillSelection.consideredSkills,
        decision
      });

      if (decision.actions.length > 0) {
        const results = await this.executor.executeAll(decision.actions);
        console.log(`[AgentRunner] Executed ${results.length} tools.`, results);
      }
    } catch (error) {
      console.error(`[AgentRunner] Failed to handle message ${message.externalId}:`, error);
      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "planning",
        summary: "AgentRunner inbound handling failed",
        payload: {
          error: error instanceof Error ? error.message : String(error)
        },
        severity: "error",
        force: true
      });
      await this.repository.addDecisionLog(message.externalId, "agent_failure", "Agent runner threw an error", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async handleWakeup(taskId: number, reason: string): Promise<void> {
    const runId = this.debugService.createRunId("agent_wakeup");
    const agentIdentity = await this.agentIdentityService.getIdentity();
    const [task, taskEvents] = await Promise.all([
      this.repository.getTaskById(taskId),
      this.repository.getTaskEvents(taskId)
    ]);
    const timeContextContact =
      (task?.target_number && (await this.repository.getContactByNumber(task.target_number))) ||
      (task?.requested_by && (await this.repository.getContactByNumber(task.requested_by))) ||
      null;
    const skillSelection = await this.skillSelector.selectForWakeup({
      wakeupReason: reason,
      task,
      taskEvents
    });
    const memoryEvidence = await this.memoryBrowser.buildWakeupEvidencePack({
      task,
      wakeupReason: reason,
      taskEvents
    });
    const promptPack = await this.promptRegistry.getActivePromptPack("agent-scheduled-wakeup");
    const timeContext = buildPromptTimeContext(timeContextContact);
    const abilityProfile = buildAgentAbilityProfile();
    const systemPrompt = appendTimeContextInstruction(`${promptPack.systemPrompt}

Current bot name: ${agentIdentity.name}
Current bot role: ${agentIdentity.roleDescription}

${AGENT_ABILITY_BOUNDARY_POLICY}`);

    const prompt = JSON.stringify(
      {
        timeContext,
        abilityProfile,
        taskId,
        task,
        wakeupReason: reason,
        recentTimeline: taskEvents,
        memoryEvidence,
        selectedSkills: skillSelection.selectedSkills,
        availableTools: ALL_AGENT_TOOLS,
        instruction:
          "Assess the timeline, decide whether the task is completed, blocked, or needs follow-up, and select only the tools needed to progress it."
      },
      null,
      2
    );

    try {
      await this.debugService.log({
        runId,
        taskId,
        stage: "planning",
        summary: "AgentRunner preparing scheduled wakeup decision",
        payload: {
          reason,
          eventCount: taskEvents.length,
          evidenceMemoryCount: memoryEvidence.relevantMemories.length,
          promptKey: promptPack.promptKey,
          promptVersionHash: promptPack.versionHash,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
        },
        requiredMode: "debug_basic"
      });

      const response = await this.llmRouter.generateJson<RawAgentExecutionResponse>({
        systemPrompt,
        prompt,
        schemaDescription: promptPack.schemaDescription,
        traceMetadata: {
          promptKey: promptPack.promptKey,
          manifestName: promptPack.manifestName,
          promptVersion: promptPack.version,
          promptVersionHash: promptPack.versionHash
        }
      });

      const decision = normalizeExecutionDecision(response, {
        classification: "scheduled_wakeup",
        goal: "Assess the task timeline and move the task forward safely.",
        riskLevel: "low"
      });
      await this.debugService.log({
        runId,
        taskId,
        stage: "planning",
        summary: "AgentRunner produced scheduled wakeup decision",
        payload: {
          classification: decision.classification,
          goal: decision.goal,
          actionCount: decision.actions.length,
          riskLevel: decision.riskLevel,
          clarificationNeeded: decision.clarificationNeeded,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
        },
        requiredMode: "debug_verbose"
      });
      await this.repository.addTaskEvent(taskId, "EXECUTION_DECISION", {
        reasoningSummary: decision.reasoningSummary,
        classification: decision.classification,
        goal: decision.goal,
        riskLevel: decision.riskLevel,
        actionCount: decision.actions.length,
        trigger: "wakeup",
        selectedSkills: skillSelection.selectedSkills
      });
      await this.repository.updateTaskSnapshot({
        taskId,
        status: decision.taskStatus ?? task?.status ?? "IN_PROGRESS",
        currentSummary: decision.reasoningSummary,
        nextStep: decision.actions.length > 0 ? `Execute ${decision.actions.length} planned action(s).` : "No further action selected.",
        waitingFor: decision.taskStatus === "WAITING" ? decision.reasoningSummary : null,
        blocker: decision.taskStatus === "BLOCKED" ? decision.reasoningSummary : null,
        latestKnownContext: {
          wakeupReason: reason,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
        }
      });

      if (decision.actions.length > 0) {
        // We pass taskId as context so tool side-effects log back to this specific task
        await this.executor.executeAll(decision.actions, taskId);
      }
    } catch (error) {
      console.error(`[AgentRunner] Failed on wakeup for task ${taskId}:`, error);
      await this.debugService.log({
        runId,
        taskId,
        stage: "planning",
        summary: "AgentRunner scheduled wakeup failed",
        payload: {
          error: error instanceof Error ? error.message : String(error),
          reason
        },
        severity: "error",
        force: true
      });
    }
  }
}
