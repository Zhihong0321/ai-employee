import { Repository } from "../database/repository.js";
import { AppConfig } from "../config.js";
import { DebugService } from "../debug/debug-service.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { buildPromptTimeContext, isTimeSensitiveText } from "../lib/time-context.js";
import { AgentPlan, InboundMessage } from "../types.js";
import { CompanyDbService } from "./company-db-service.js";
import { OpenAiService } from "./openai-service.js";
import { SkillSelector } from "../skills/skill-selector.js";
import { ResolvedSkillContext, SkillSelectionEntry } from "../skills/types.js";
import { buildTaskCharter, buildTaskSnapshot } from "../agent/task-core.js";
import { MemoryBrowserService } from "./memory-browser-service.js";
import { AgentIdentityService } from "./agent-identity-service.js";
import { isWhatsAppGroupChat } from "../lib/phone.js";
import { AuthorityPolicyService } from "./authority-policy-service.js";
import { applySensitiveAuthorityGuard } from "../lib/authority-guard.js";

export type WhatsAppSender = {
  sendText: (targetNumber: string, text: string) => Promise<InboundMessage | null>;
  getOwnNumber?: () => string | null;
};

export type LocalAgentSimulationResult = {
  runId: string;
  messageExternalId: string;
  senderNumber: string;
  senderName: string | null;
  normalizedText: string;
  senderProfile: unknown;
  recentContext: unknown;
  selectedSkills: ResolvedSkillContext[];
  consideredSkills: SkillSelectionEntry[];
  plan: AgentPlan;
  toolOutputs: Record<string, unknown>;
  finalReply: string;
  createdTasks: Array<{
    task: any;
    events: any[];
  }>;
  decisionLogs: any[];
  debugRecords: any[];
  messages: any[];
};

export class AgentService {
  private whatsappSender?: WhatsAppSender;

  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository,
    private readonly debugService: DebugService,
    private readonly openAiService: OpenAiService,
    private readonly companyDbService: CompanyDbService,
    private readonly skillSelector: SkillSelector,
    private readonly memoryBrowser: MemoryBrowserService,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly authorityPolicyService: AuthorityPolicyService
  ) {}

  setWhatsappSender(sender: WhatsAppSender): void {
    this.whatsappSender = sender;
  }

  async handleInboundMessage(message: InboundMessage): Promise<void> {
    const runId = this.debugService.createRunId("agent_msg");
    const shouldRespond = message.shouldRespond ?? true;
    const agentIdentity = await this.agentIdentityService.getIdentity();
    try {
      await this.repository.saveMessage(message, "inbound");

      const senderNumber = normalizePhoneNumber(message.senderNumber);
      const [senderProfile, recentContext] = await Promise.all([
        this.repository.getContactByNumber(senderNumber),
        this.repository.getRecentContext(senderNumber)
      ]);
      const authorityContext = await this.authorityPolicyService.buildAuthorityContext({
        senderNumber,
        senderName: message.senderName ?? null,
        senderProfile
      });
      const memoryEvidence = await this.memoryBrowser.buildInboundEvidencePack(message);
      const skillSelection = await this.skillSelector.selectForInbound({
        normalizedText: normalizedTextFromMessage(message),
        senderProfile,
        recentContext
      });

      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "context_load",
        summary: "Loaded inbound planning context",
        payload: {
          senderNumber,
          hasSenderProfile: Boolean(senderProfile),
          recentMessageCount: recentContext.recentMessages?.length ?? 0,
          recentFactsCount: recentContext.facts?.length ?? 0,
          evidenceMemoryCount: memoryEvidence.relevantMemories.length,
          evidenceTaskCount: memoryEvidence.activeTasks.length,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId),
          selectedSkillNames: skillSelection.selectedSkills.map((skill) => skill.name)
        },
        requiredMode: "debug_basic"
      });

      const normalizedText = normalizedTextFromMessage(message);

      const plan = await this.openAiService.planMessage({
        senderProfile,
        recentContext,
        memoryEvidence,
        messageContext: {
          chatId: message.chatId,
          isGroupChat: message.isGroupChat,
          shouldRespond: shouldRespond,
          addressReason: message.addressReason ?? null,
          groupContext: message.groupContext ?? null,
          reactionDecision: message.reactionDecision ?? null
        },
        authorityContext,
        normalizedText,
        botName: agentIdentity.name,
        botRoleDescription: agentIdentity.roleDescription,
        selectedSkills: skillSelection.selectedSkills
      });
      const guardedPlanResult = applySensitiveAuthorityGuard({
        normalizedText,
        context: authorityContext,
        plan
      });
      const effectivePlan = guardedPlanResult.plan;

      if (guardedPlanResult.blocked) {
        await this.debugService.log({
          runId,
          messageExternalId: message.externalId,
          stage: "policy_validation",
          summary: "Blocked unauthorized sensitive authority-change request",
          payload: {
            senderNumber,
            reason: guardedPlanResult.reason ?? "authority_guard_blocked",
            authorityContext
          },
          severity: "warn",
          requiredMode: "debug_basic"
        });
      }

      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "planning",
        summary: "Planner returned structured message plan",
        payload: {
          category: effectivePlan.category,
          summary: effectivePlan.summary,
          taskCount: effectivePlan.tasks.length,
          reminderCount: effectivePlan.reminders.length,
          outboundCount: effectivePlan.outboundMessages.length,
          clarificationNeeded: effectivePlan.clarification?.needed ?? false,
          authorityGuardBlocked: guardedPlanResult.blocked,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
        },
        requiredMode: "debug_basic"
      });

      const toolOutputs = await this.runToolCalls(effectivePlan, runId, message.externalId);
      const finalReply = await this.openAiService.writeFinalReply({
        normalizedText,
        plan: effectivePlan,
        toolOutputs,
        botName: agentIdentity.name,
        botRoleDescription: agentIdentity.roleDescription,
        senderProfile
      });

      await this.persistPlanEffects(message, senderNumber, effectivePlan, runId);

      if (finalReply) {
        if (shouldRespond) {
          await this.sendReply(message.chatId, finalReply, message.externalId, runId);
        } else {
          await this.debugService.log({
            runId,
            messageExternalId: message.externalId,
            stage: "outbound_send",
            summary: "Suppressed direct reply because message should remain silent",
            payload: {
              chatId: message.chatId,
              addressReason: message.addressReason ?? null
            },
            requiredMode: "debug_basic"
          });
        }
      }

      if (shouldRespond) {
        await this.executeOutboundMessages(effectivePlan, runId);
      }

      if (
        shouldRespond &&
        effectivePlan.clarification?.needed &&
        effectivePlan.clarification.targetNumber &&
        effectivePlan.clarification.question
      ) {
        await this.repository.addClarificationThread(effectivePlan.summary, effectivePlan, message.externalId);
        await this.sendSafeMessage(effectivePlan.clarification.targetNumber, effectivePlan.clarification.question, "low", runId);
      }

      await this.repository.addDecisionLog(message.externalId, "message_plan", effectivePlan.summary, {
        plan: effectivePlan,
        toolOutputs,
        authorityContext,
        authorityGuardBlocked: guardedPlanResult.blocked,
        authorityGuardReason: guardedPlanResult.reason ?? null,
        selectedSkills: skillSelection.selectedSkills,
        consideredSkills: skillSelection.consideredSkills
      });

      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "state_write",
        summary: "Inbound message plan persisted",
        payload: {
          planSummary: effectivePlan.summary,
          replied: Boolean(finalReply) && shouldRespond
        },
        requiredMode: "debug_basic"
      });
    } catch (error) {
      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "planning",
        summary: "Inbound agent flow failed",
        payload: {
          error: error instanceof Error ? error.message : String(error)
        },
        severity: "error",
        force: true
      });
      throw error;
    }
  }

  async simulateLocalInstruction(input: {
    senderNumber?: string | null;
    senderName?: string | null;
    text: string;
  }): Promise<LocalAgentSimulationResult> {
    const runId = this.debugService.createRunId("local_agent_lab");
    const senderNumber = normalizePhoneNumber(input.senderNumber) || "601100000001";
    const senderName = input.senderName?.trim() || null;
    const normalizedText = String(input.text ?? "").trim();
    const messageExternalId = `local-playground:${runId}`;
    const chatId = `local-playground:${senderNumber}`;
    const agentIdentity = await this.agentIdentityService.getIdentity();

    if (!normalizedText) {
      throw new Error("Instruction text is required.");
    }

    try {
      await this.repository.ensureContactShell({
        whatsappNumber: senderNumber,
        name: senderName ?? `Local User ${senderNumber}`,
        notes: "Local playground identity."
      });

      await this.repository.saveStoredMessage({
        externalId: messageExternalId,
        chatId,
        senderNumber,
        senderName,
        direction: "inbound",
        kind: "text",
        text: normalizedText,
        rawPayload: {
          source: "local_playground",
          runId
        },
        occurredAt: new Date(),
        contactNumber: senderNumber,
        authorNumber: senderNumber,
        authorName: senderName,
        isFromMe: false
      });

      const [senderProfile, recentContext] = await Promise.all([
        this.repository.getContactByNumber(senderNumber),
        this.repository.getRecentContext(senderNumber)
      ]);
      const authorityContext = await this.authorityPolicyService.buildAuthorityContext({
        senderNumber,
        senderName,
        senderProfile
      });
      const memoryEvidence = await this.memoryBrowser.buildInboundEvidencePack({
        externalId: messageExternalId,
        chatId,
        isGroupChat: false,
        senderNumber,
        senderName,
        kind: "text",
        text: normalizedText,
        rawPayload: {
          source: "local_playground",
          runId
        },
        occurredAt: new Date()
      });
      const skillSelection = await this.skillSelector.selectForInbound({
        normalizedText,
        senderProfile,
        recentContext
      });

      await this.debugService.log({
        runId,
        messageExternalId,
        stage: "context_load",
        summary: "Prepared local playground planning context",
        payload: {
          senderNumber,
          senderName,
          normalizedText,
          hasSenderProfile: Boolean(senderProfile),
          evidenceMemoryCount: memoryEvidence.relevantMemories.length,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId),
          selectedSkillNames: skillSelection.selectedSkills.map((skill) => skill.name)
        },
        force: true
      });

      const plan = await this.openAiService.planMessage({
        senderProfile,
        recentContext,
        memoryEvidence,
        messageContext: {
          chatId,
          isGroupChat: false,
          shouldRespond: true,
          addressReason: "direct_pm",
          groupContext: null
        },
        authorityContext,
        normalizedText,
        botName: agentIdentity.name,
        botRoleDescription: agentIdentity.roleDescription,
        selectedSkills: skillSelection.selectedSkills
      });
      const guardedPlanResult = applySensitiveAuthorityGuard({
        normalizedText,
        context: authorityContext,
        plan
      });
      const effectivePlan = guardedPlanResult.plan;

      await this.debugService.log({
        runId,
        messageExternalId,
        stage: "planning",
        summary: "Planner returned local playground plan",
        payload: {
          category: effectivePlan.category,
          summary: effectivePlan.summary,
          taskCount: effectivePlan.tasks.length,
          reminderCount: effectivePlan.reminders.length,
          outboundCount: effectivePlan.outboundMessages.length,
          authorityGuardBlocked: guardedPlanResult.blocked,
          selectedSkillIds: skillSelection.selectedSkills.map((skill) => skill.skillId)
        },
        force: true
      });

      const toolOutputs = await this.runToolCalls(effectivePlan, runId, messageExternalId);
      const finalReply = await this.openAiService.writeFinalReply({
        normalizedText,
        plan: effectivePlan,
        toolOutputs,
        botName: agentIdentity.name,
        botRoleDescription: agentIdentity.roleDescription,
        senderProfile
      });

      const persisted = await this.persistPlanEffects(
        {
          externalId: messageExternalId,
          chatId,
          isGroupChat: false,
          senderNumber,
          senderName,
          kind: "text",
          text: normalizedText,
          rawPayload: {
            source: "local_playground",
            runId
          },
          occurredAt: new Date()
        },
        senderNumber,
        effectivePlan,
        runId
      );

      await this.repository.saveStoredMessage({
        externalId: `${messageExternalId}:reply`,
        chatId,
        senderNumber,
        senderName: agentIdentity.name,
        direction: "outbound",
        kind: "text",
        text: finalReply,
        rawPayload: {
          source: "local_playground",
          runId,
          sourceMessageExternalId: messageExternalId
        },
        occurredAt: new Date(),
        contactNumber: senderNumber,
        authorNumber: agentIdentity.name,
        authorName: agentIdentity.name,
        isFromMe: true
      });

      for (const taskId of persisted.createdTaskIds) {
        await this.repository.addTaskEvent(taskId, "local_playground_created", {
          runId,
          sourceMessageExternalId: messageExternalId,
          replyPreview: finalReply
        });
      }

      await this.repository.addDecisionLog(messageExternalId, "local_playground_reply", "Generated local playground reply", {
        finalReply,
        skippedOutboundMessages: effectivePlan.outboundMessages.length,
        clarificationNeeded: effectivePlan.clarification?.needed ?? false,
        authorityContext,
        authorityGuardBlocked: guardedPlanResult.blocked,
        authorityGuardReason: guardedPlanResult.reason ?? null,
        selectedSkills: skillSelection.selectedSkills,
        consideredSkills: skillSelection.consideredSkills
      });

      await this.debugService.log({
        runId,
        messageExternalId,
        stage: "state_write",
        summary: "Local playground run persisted without WhatsApp side effects",
        payload: {
          createdTaskCount: persisted.createdTaskIds.length,
          reminderCount: effectivePlan.reminders.length,
          outboundPreviewCount: effectivePlan.outboundMessages.length,
          clarificationNeeded: effectivePlan.clarification?.needed ?? false
        },
        force: true
      });

      const [createdTasks, decisionLogs, debugRecords, messages] = await Promise.all([
        this.repository.getTasksBySourceMessageExternalId(messageExternalId),
        this.repository.listDecisionLogs({
          messageExternalId,
          limit: 50
        }),
        this.repository.listDebugRecords({
          runId,
          limit: 100
        }),
        this.repository.listMessagesForContact(senderNumber, 20)
      ]);

      const tasksWithEvents = await Promise.all(
        createdTasks.map(async (task) => ({
          task,
          events: await this.repository.getTaskEvents(Number(task.id))
        }))
      );

      return {
        runId,
        messageExternalId,
        senderNumber,
        senderName,
        normalizedText,
        senderProfile,
        recentContext,
        selectedSkills: skillSelection.selectedSkills,
        consideredSkills: skillSelection.consideredSkills,
        plan: effectivePlan,
        toolOutputs,
        finalReply,
        createdTasks: tasksWithEvents,
        decisionLogs,
        debugRecords,
        messages
      };
    } catch (error) {
      await this.debugService.log({
        runId,
        messageExternalId,
        stage: "planning",
        summary: "Local playground simulation failed",
        payload: {
          error: error instanceof Error ? error.message : String(error)
        },
        severity: "error",
        force: true
      });
      await this.repository.addDecisionLog(messageExternalId, "local_playground_failure", "Local playground simulation failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  private async captureKnowledgeAsset(message: InboundMessage): Promise<void> {
    if (!message.mediaPath && !message.analysis && !message.transcript) {
      return;
    }

    const assetId = await this.repository.addKnowledgeAsset({
      sourceType: message.kind,
      sourceRef: message.mediaPath ?? `message:${message.externalId}`,
      title: message.text || `${message.kind} from ${message.senderName || message.senderNumber}`,
      mimeType: message.mimeType ?? null,
      textContent: [message.text, message.transcript, message.analysis].filter(Boolean).join("\n\n"),
      summary: message.analysis ?? message.transcript ?? null,
      metadata: {
        externalId: message.externalId,
        senderNumber: message.senderNumber,
        chatId: message.chatId
      },
      createdBy: message.senderNumber
    });

    await this.repository.upsertMemoryIndex({
      memoryKey: `knowledge_asset:${assetId}`,
      memoryType: "knowledge_asset",
      scopeType: message.isGroupChat ? "group_chat" : "contact",
      scopeId: message.isGroupChat ? message.chatId : normalizePhoneNumber(message.senderNumber),
      title: message.text || `${message.kind} asset`,
      summary: (message.analysis ?? message.transcript ?? message.text ?? "").slice(0, 600),
      sourceTable: "knowledge_assets",
      sourceRef: String(assetId),
      tags: [message.kind, message.mimeType ?? "unknown"],
      entities: [message.senderName ?? "", normalizePhoneNumber(message.senderNumber)].filter(Boolean),
      importanceScore: 0.7,
      freshnessScore: 0.9,
      confidence: 0.8,
      metadata: {
        externalId: message.externalId,
        chatId: message.chatId
      }
    });
  }

  async executeScheduledReminder(job: any): Promise<void> {
    const runId = this.debugService.createRunId("sched_reminder");
    const targetNumber = normalizePhoneNumber(job.payload.targetNumber);
    const text = String(job.payload.message ?? "");
    await this.debugService.log({
      runId,
      schedulerJobId: Number(job.id),
      taskId: Number(job.source_task_id) || null,
      stage: "scheduler",
      summary: "Executing scheduled reminder job",
      payload: {
        targetNumber,
        jobType: job.job_type
      },
      requiredMode: "debug_basic"
    });
    await this.sendSafeMessage(targetNumber, text, "low", runId);
    if (job.source_task_id) {
      await this.repository.addTaskEvent(Number(job.source_task_id), "REMINDER_SENT", {
        schedulerJobId: Number(job.id),
        targetNumber,
        message: text
      });
      await this.repository.updateTaskSnapshot({
        taskId: Number(job.source_task_id),
        currentSummary: `Reminder sent to ${targetNumber}.`,
        nextStep: "Wait for a response or the next follow-up trigger.",
        waitingFor: `response_from:${targetNumber}`,
        latestKnownContext: {
          lastReminderSchedulerJobId: Number(job.id),
          lastReminderTargetNumber: targetNumber
        }
      });
    }
  }

  private async runToolCalls(plan: AgentPlan, runId?: string, messageExternalId?: string): Promise<Record<string, unknown>> {
    const toolOutputs: Record<string, unknown> = {};

    if (plan.webSearchQuery) {
      toolOutputs.webSearch = await this.openAiService.webSearch(plan.webSearchQuery);
      await this.debugService.log({
        runId,
        messageExternalId,
        stage: "tool_call",
        summary: "Executed web search tool",
        payload: {
          query: plan.webSearchQuery,
          resultPresent: Boolean((toolOutputs.webSearch as any)?.answer)
        },
        toolName: "web_search",
        requiredMode: "debug_verbose"
      });
    }

    if (plan.companyQuery) {
      try {
        toolOutputs.companyQuery = await this.companyDbService.runReadOnlyQuery(plan.companyQuery);
      } catch (error) {
        toolOutputs.companyQuery = {
          error: error instanceof Error ? error.message : "Company query failed"
        };
      }

      await this.debugService.log({
        runId,
        messageExternalId,
        stage: "tool_call",
        summary: "Executed company query tool",
        payload: {
          query: plan.companyQuery,
          errored: Boolean((toolOutputs.companyQuery as any)?.error)
        },
        toolName: "company_query",
        requiredMode: "debug_verbose"
      });
    }

    return toolOutputs;
  }

  private async persistPlanEffects(
    message: InboundMessage,
    senderNumber: string,
    plan: AgentPlan,
    runId?: string
  ): Promise<{ createdTaskIds: number[] }> {
    const createdTaskIds: number[] = [];
    const senderProfile = await this.repository.getContactByNumber(senderNumber);
    const senderTimeContext = buildPromptTimeContext(senderProfile);

    for (const contactUpdate of plan.contactUpdates) {
      await this.repository.upsertContact({
        ...contactUpdate,
        whatsappNumber: normalizePhoneNumber(contactUpdate.whatsappNumber)
      });
    }

    for (const claim of plan.claims) {
      const claimId = await this.repository.addClaim({
        subject: claim.subject,
        predicate: claim.predicate,
        value: claim.value,
        status: claim.status,
        confidence: claim.confidence,
        sourceMessageExternalId: message.externalId,
        sourceContactNumber: senderNumber
      });

      const factKey = `${claim.subject}:${claim.predicate}`;
      await this.repository.upsertFact({
        factKey,
        subject: claim.subject,
        predicate: claim.predicate,
        value: claim.value,
        status: "working",
        confidence: claim.confidence,
        sourceClaimId: claimId,
        sourceContactNumber: senderNumber
      });
      await this.repository.upsertMemoryIndex({
        memoryKey: `fact:${factKey}`,
        memoryType: "fact",
        scopeType: message.isGroupChat ? "group_chat" : "contact",
        scopeId: message.isGroupChat ? message.chatId : senderNumber,
        title: `${claim.subject} ${claim.predicate}`,
        summary: `${claim.subject} ${claim.predicate} ${claim.value}`,
        sourceTable: "facts",
        sourceRef: factKey,
        tags: [claim.subject, claim.predicate],
        entities: [claim.subject],
        importanceScore: 0.8,
        freshnessScore: 0.85,
        confidence: claim.confidence,
        metadata: {
          sourceMessageExternalId: message.externalId
        }
      });
    }

    for (const fact of plan.facts) {
      await this.repository.upsertFact({
        factKey: fact.factKey,
        subject: fact.subject,
        predicate: fact.predicate,
        value: fact.value,
        status: fact.status,
        confidence: fact.confidence,
        sourceContactNumber: senderNumber
      });
      await this.repository.upsertMemoryIndex({
        memoryKey: `fact:${fact.factKey}`,
        memoryType: "fact",
        scopeType: message.isGroupChat ? "group_chat" : "contact",
        scopeId: message.isGroupChat ? message.chatId : senderNumber,
        title: `${fact.subject} ${fact.predicate}`,
        summary: `${fact.subject} ${fact.predicate} ${fact.value}`,
        sourceTable: "facts",
        sourceRef: fact.factKey,
        tags: [fact.subject, fact.predicate],
        entities: [fact.subject],
        importanceScore: fact.status === "confirmed" ? 0.9 : 0.75,
        freshnessScore: 0.8,
        confidence: fact.confidence,
        metadata: {
          sourceMessageExternalId: message.externalId
        }
      });
    }

    for (const task of plan.tasks) {
      const taskId = await this.repository.addTask({
        title: task.title,
        details: task.details,
        status: "TODO",
        requestedBy: senderNumber,
        targetNumber: task.targetNumber ? normalizePhoneNumber(task.targetNumber) : null,
        dueAt: task.dueAt ?? null,
        sourceMessageExternalId: message.externalId,
        timezone: senderTimeContext.userTimezone,
        timezoneSource: senderTimeContext.timezoneSource,
        charter: buildTaskCharter({
          originalIntent: task.details,
          requesterNumber: senderNumber,
          targetNumber: task.targetNumber ? normalizePhoneNumber(task.targetNumber) : null,
          constraints: {
            planCategory: plan.category,
            planSummary: plan.summary
          },
          sourceMessageExternalId: message.externalId,
          timezone: senderTimeContext.userTimezone,
          timezoneSource: senderTimeContext.timezoneSource,
          interpretedAtUtc: senderTimeContext.utcNow
        }),
        snapshot: buildTaskSnapshot({
          status: "TODO",
          currentSummary: task.details,
          nextStep: task.dueAt ? "Wait until the scheduled follow-up time and then continue the task." : "Choose the first useful action.",
          latestKnownContext: {
            sourceMessageExternalId: message.externalId,
            planSummary: plan.summary
          }
        })
      });
      createdTaskIds.push(taskId);
      await this.repository.addTaskEvent(taskId, "TASK_CREATED", {
        sourceMessageExternalId: message.externalId,
        planSummary: plan.summary,
        requesterNumber: senderNumber
      });
      await this.repository.upsertMemoryIndex({
        memoryKey: `task:${taskId}`,
        memoryType: "task",
        scopeType: message.isGroupChat ? "group_chat" : "contact",
        scopeId: message.isGroupChat ? message.chatId : senderNumber,
        title: task.title,
        summary: task.details,
        sourceTable: "tasks",
        sourceRef: String(taskId),
        tags: ["task", plan.category],
        entities: [senderNumber, task.targetNumber ? normalizePhoneNumber(task.targetNumber) : ""].filter(Boolean),
        importanceScore: 0.9,
        freshnessScore: 0.9,
        confidence: 0.95,
        metadata: {
          sourceMessageExternalId: message.externalId,
          dueAt: task.dueAt ?? null
        }
      });

      if (task.dueAt && task.targetNumber) {
        await this.repository.addScheduledJob({
          jobType: "task-follow-up",
          runAt: task.dueAt,
          createdBy: senderNumber,
          sourceTaskId: taskId,
          retryLimit: 3,
          idempotencyKey: `task-follow-up:${taskId}:${task.dueAt}`,
          timezoneContext: senderTimeContext,
          payload: {
            targetNumber: normalizePhoneNumber(task.targetNumber),
            message: task.details
          }
        });
      }
    }

    for (const reminder of plan.reminders) {
      await this.repository.addScheduledJob({
        jobType: "reminder",
        runAt: reminder.runAt,
        createdBy: senderNumber,
        retryLimit: 3,
        idempotencyKey: `reminder:${senderNumber}:${reminder.targetNumber}:${reminder.runAt}:${reminder.message}`,
        timezoneContext: senderTimeContext,
        payload: {
          targetNumber: normalizePhoneNumber(reminder.targetNumber),
          message: reminder.message
        }
      });
    }

    if (plan.category === "question" && message.text && plan.replyText && !isTimeSensitiveText(message.text)) {
      await this.repository.upsertQueryCache(message.text, plan.replyText, senderNumber);
      await this.repository.upsertMemoryIndex({
        memoryKey: `query_cache:${message.text.toLowerCase()}`,
        memoryType: "query_answer",
        scopeType: "global",
        scopeId: null,
        title: message.text,
        summary: plan.replyText,
        sourceTable: "query_cache",
        sourceRef: message.text,
        tags: ["query_cache", plan.category],
        entities: [],
        importanceScore: 0.65,
        freshnessScore: 0.6,
        confidence: 0.8,
        metadata: {
          sourceContactNumber: senderNumber
        }
      });
    }

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "state_write",
      summary: "Persisted planner side effects",
      payload: {
        contactUpdates: plan.contactUpdates.length,
        claims: plan.claims.length,
        facts: plan.facts.length,
        tasks: plan.tasks.length,
        reminders: plan.reminders.length
      },
      requiredMode: "debug_verbose"
    });

    return {
      createdTaskIds
    };
  }

  private async executeOutboundMessages(plan: AgentPlan, runId?: string): Promise<void> {
    for (const outbound of plan.outboundMessages) {
      await this.sendSafeMessage(outbound.targetNumber, outbound.text, outbound.risk, runId);
    }
  }

  private async sendReply(chatId: string, text: string, sourceExternalId: string, runId?: string): Promise<void> {
    if (!this.whatsappSender) {
      return;
    }

    await this.whatsappSender.sendText(chatId, text);
    await this.repository.saveMessage(
      {
        externalId: `outbound:${sourceExternalId}:${Date.now()}`,
        chatId,
        isGroupChat: isWhatsAppGroupChat(chatId),
        senderNumber: normalizePhoneNumber(chatId.split("@")[0] ?? chatId),
        kind: "text",
        text,
        rawPayload: {
          sourceExternalId
        },
        occurredAt: new Date()
      },
      "outbound"
    );

    await this.debugService.log({
      runId,
      messageExternalId: sourceExternalId,
      stage: "outbound_send",
      summary: "Sent direct reply to inbound chat",
      payload: {
        chatId,
        replyCharacters: text.length
      },
      requiredMode: "debug_basic"
    });
  }

  private async sendSafeMessage(targetNumber: string, text: string, risk: "low" | "sensitive", runId?: string): Promise<void> {
    const normalized = normalizePhoneNumber(targetNumber);

    if (risk === "sensitive" && this.config.autonomyMode !== "wide") {
      await this.debugService.log({
        runId,
        stage: "policy_validation",
        summary: "Blocked sensitive outbound message",
        payload: {
          targetNumber: normalized,
          risk
        },
        severity: "warn",
        requiredMode: "debug_basic"
      });
      await this.repository.addDecisionLog(null, "blocked_sensitive_message", "Sensitive outbound message blocked", {
        targetNumber: normalized,
        text
      });
      return;
    }

    const allowed = await this.repository.canAutonomouslyReachContact(normalized);
    if (!allowed) {
      await this.debugService.log({
        runId,
        stage: "policy_validation",
        summary: "Blocked autonomous outbound message by contact policy",
        payload: {
          targetNumber: normalized,
          risk
        },
        severity: "warn",
        requiredMode: "debug_basic"
      });
      await this.repository.addDecisionLog(
        null,
        "blocked_outreach_permission",
        "Autonomous outbound message blocked by contact policy",
        {
          targetNumber: normalized,
          text,
          risk
        }
      );
      return;
    }

    if (!this.whatsappSender) {
      return;
    }

    await this.whatsappSender.sendText(`${normalized}@s.whatsapp.net`, text);
    await this.repository.saveMessage(
      {
        externalId: `outbound:auto:${normalized}:${Date.now()}`,
        chatId: `${normalized}@s.whatsapp.net`,
        isGroupChat: false,
        senderNumber: normalized,
        kind: "text",
        text,
        rawPayload: {
          risk
        },
        occurredAt: new Date()
      },
      "outbound"
    );

    await this.debugService.log({
      runId,
      stage: "outbound_send",
      summary: "Sent autonomous outbound WhatsApp message",
      payload: {
        targetNumber: normalized,
        risk,
        messageCharacters: text.length
      },
      requiredMode: "debug_basic"
    });
  }
}

function normalizedTextFromMessage(message: InboundMessage): string {
  return [message.text, message.transcript, message.analysis]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}
