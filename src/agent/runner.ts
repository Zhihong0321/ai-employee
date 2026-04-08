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
import { assembleInboundContext, assembleWakeupContext } from "../lib/context-budget.js";

/** Tools that are read-only and trigger a ReAct loop continuation. */
const READ_TOOL_NAMES = new Set(["query_database"]);

/** Maximum number of read-tool ReAct cycles before forcing a direct decision. */
const MAX_READ_CYCLES = 2;

export class AgentRunner {
  constructor(
    private readonly llmRouter: LlmRouter,
    private readonly repository: Repository,
    private readonly executor: AgentToolExecutor,
    private readonly promptRegistry: PromptRegistry,
    private readonly debugService: DebugService,
    private readonly skillSelector: SkillSelector,
    private readonly memoryBrowser: MemoryBrowserService,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly contextBudgetTokens: number
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
    const budgetedContext = assembleInboundContext(
      {
        senderProfile: profile,
        recentContext,
        activeTasks,
        memoryEvidence
      },
      this.contextBudgetTokens
    );

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
        contextBudget: budgetedContext.budgetMeta,
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

    const baseUserPayload = {
      timeContext,
      abilityProfile,
      senderName: message.senderName || senderNumber,
      normalizedText,
      senderProfile: budgetedContext.senderProfile,
      recentContext: budgetedContext.recentContext,
      memoryEvidence: budgetedContext.memoryEvidence,
      activeTasks: budgetedContext.activeTasks,
      contextBudget: budgetedContext.budgetMeta,
      selectedSkills: skillSelection.selectedSkills,
      availableTools: ALL_AGENT_TOOLS,
      instruction: "Choose the next state transition or action required."
    };

    try {
      // ── ReAct loop: up to MAX_READ_CYCLES read-tool cycles ────────────────
      let readResults: Array<{ tool: string; result: string }> = [];
      let finalDecision;

      for (let cycle = 0; cycle <= MAX_READ_CYCLES; cycle++) {
        const userPrompt = JSON.stringify(
          cycle === 0
            ? baseUserPayload
            : {
                ...baseUserPayload,
                readToolResults: readResults,
                instruction: cycle >= MAX_READ_CYCLES
                  ? "You have reached the read-cycle limit. Using the data retrieved, choose the final action now."
                  : "Use the retrieved data above to decide your next action. You may query again or proceed to a final action."
              },
          null,
          2
        );

        const response = await this.llmRouter.generateJson<RawAgentExecutionResponse>({
          systemPrompt,
          prompt: userPrompt,
          schemaDescription: promptPack.schemaDescription,
          referenceContext: promptPack.referenceContext,
          traceMetadata: {
            promptKey: promptPack.promptKey,
            manifestName: promptPack.manifestName,
            promptVersion: promptPack.version,
            promptVersionHash: promptPack.versionHash,
            // SDMO Phase 3: links this LLM call to the active tasks for the sender.
            sourceTaskId: activeTasks.length > 0 ? String(activeTasks[0].id) : undefined
          }
        });

        const decision = normalizeExecutionDecision(response, {
          classification: "inbound_message",
          goal: "Choose the next state transition or action required.",
          riskLevel: "low"
        });

        // Partition actions: read vs effectful
        const readActions = decision.actions.filter((a) => READ_TOOL_NAMES.has(a.tool));
        const effectActions = decision.actions.filter((a) => !READ_TOOL_NAMES.has(a.tool));

        // If the LLM chose read tools AND we have cycles left, execute them and loop
        if (readActions.length > 0 && cycle < MAX_READ_CYCLES) {
          await this.debugService.log({
            runId,
            messageExternalId: message.externalId,
            stage: "planning",
            summary: `AgentRunner ReAct cycle ${cycle + 1}: executing ${readActions.length} read tool(s)`,
            payload: { readTools: readActions.map((a) => a.tool) },
            requiredMode: "debug_basic"
          });

          for (const action of readActions) {
            const result = await this.executor.execute(action.tool, action.args);
            readResults.push({ tool: action.tool, result });
          }

          // If there are also effectful actions alongside the read, execute them now too
          if (effectActions.length > 0) {
            await this.executor.executeAll(effectActions);
          }

          continue; // Go back for another LLM call with the read results
        }

        // No read tools (or cycle limit reached) — this is the final decision
        finalDecision = decision;

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
            clarificationNeeded: decision.clarificationNeeded,
            reactCycles: cycle
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
        break;
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
    const budgetedContext = assembleWakeupContext(
      {
        task,
        taskEvents,
        memoryEvidence
      },
      this.contextBudgetTokens
    );
    const timeContext = buildPromptTimeContext(timeContextContact);
    const abilityProfile = buildAgentAbilityProfile();
    const systemPrompt = appendTimeContextInstruction(`${promptPack.systemPrompt}

Current bot name: ${agentIdentity.name}
Current bot role: ${agentIdentity.roleDescription}

${AGENT_ABILITY_BOUNDARY_POLICY}`);

    const baseWakeupPayload = {
      timeContext,
      abilityProfile,
      taskId,
      task: budgetedContext.task,
      wakeupReason: reason,
      recentTimeline: budgetedContext.recentTimeline,
      memoryEvidence: budgetedContext.memoryEvidence,
      contextBudget: budgetedContext.budgetMeta,
      selectedSkills: skillSelection.selectedSkills,
      availableTools: ALL_AGENT_TOOLS,
      instruction:
        "Assess the timeline, decide whether the task is completed, blocked, or needs follow-up, and select only the tools needed to progress it."
    };

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
          contextBudget: budgetedContext.budgetMeta,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
        },
        requiredMode: "debug_basic"
      });

      // ── ReAct loop: up to MAX_READ_CYCLES read-tool cycles ────────────────
      let readResults: Array<{ tool: string; result: string }> = [];

      for (let cycle = 0; cycle <= MAX_READ_CYCLES; cycle++) {
        const prompt = JSON.stringify(
          cycle === 0
            ? baseWakeupPayload
            : {
                ...baseWakeupPayload,
                readToolResults: readResults,
                instruction: cycle >= MAX_READ_CYCLES
                  ? "You have reached the read-cycle limit. Using the data retrieved, choose the final action now."
                  : "Use the retrieved data above to decide your next action. You may query again or proceed to a final action."
              },
          null,
          2
        );

        const response = await this.llmRouter.generateJson<RawAgentExecutionResponse>({
          systemPrompt,
          prompt,
          schemaDescription: promptPack.schemaDescription,
          referenceContext: promptPack.referenceContext,
          traceMetadata: {
            promptKey: promptPack.promptKey,
            manifestName: promptPack.manifestName,
            promptVersion: promptPack.version,
            promptVersionHash: promptPack.versionHash,
            // SDMO Phase 3: links this LLM call back to the specific task for the watcher.
            sourceTaskId: String(taskId)
          }
        });

        const decision = normalizeExecutionDecision(response, {
          classification: "scheduled_wakeup",
          goal: "Assess the task timeline and move the task forward safely.",
          riskLevel: "low"
        });

        // Partition actions: read vs effectful
        const readActions = decision.actions.filter((a) => READ_TOOL_NAMES.has(a.tool));
        const effectActions = decision.actions.filter((a) => !READ_TOOL_NAMES.has(a.tool));

        // If the LLM chose read tools AND we have cycles left, execute and loop
        if (readActions.length > 0 && cycle < MAX_READ_CYCLES) {
          await this.debugService.log({
            runId,
            taskId,
            stage: "planning",
            summary: `AgentRunner ReAct cycle ${cycle + 1}: executing ${readActions.length} read tool(s)`,
            payload: { readTools: readActions.map((a) => a.tool) },
            requiredMode: "debug_basic"
          });

          for (const action of readActions) {
            const result = await this.executor.execute(action.tool, action.args, taskId);
            readResults.push({ tool: action.tool, result });
          }

          if (effectActions.length > 0) {
            await this.executor.executeAll(effectActions, taskId);
          }

          continue;
        }

        // Final decision
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
            selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId),
            reactCycles: cycle
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
        break;
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
