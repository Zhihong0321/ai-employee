import { ReactionClassifier } from "../agent/reaction-classifier.js";
import { getFastStoreOnlyDecision } from "../agent/intake.js";
import { Repository } from "../database/repository.js";
import { DebugService } from "../debug/debug-service.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { InboundMessage } from "../types.js";
import { AgentIdentityService } from "./agent-identity-service.js";
import { AuthorityPolicyService } from "./authority-policy-service.js";

type DownstreamHandler = {
  handleInboundMessage: (message: InboundMessage) => Promise<void>;
};

export class WhatsAppIntakeService {
  private ownNumberResolver?: () => string | null;

  constructor(
    private readonly repository: Repository,
    private readonly debugService: DebugService,
    private readonly reactionClassifier: ReactionClassifier,
    private readonly agentIdentityService: AgentIdentityService,
    private readonly authorityPolicyService: AuthorityPolicyService,
    private readonly downstreamHandler?: DownstreamHandler
  ) {}

  setOwnNumberResolver(resolver: () => string | null): void {
    this.ownNumberResolver = resolver;
  }

  async handleInboundMessage(message: InboundMessage): Promise<void> {
    const runId = this.debugService.createRunId("intake");
    const agentIdentity = await this.agentIdentityService.getIdentity();
    const contactNumber = normalizePhoneNumber(message.senderNumber);
    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "intake",
      summary: "Inbound WhatsApp event received",
      payload: {
        kind: message.kind,
        isGroupChat: message.isGroupChat,
        senderNumber: contactNumber,
        senderLid: message.senderLid ?? null,
        hasMedia: Boolean(message.mediaPath),
        chatId: message.chatId
      },
      requiredMode: "debug_basic"
    });

    const contact = await this.repository.ensureContactShell({
      whatsappNumber: contactNumber,
      whatsappLid: message.senderLid ?? null,
      name: message.senderName ?? contactNumber
    });

    const inserted = await this.repository.saveStoredMessage({
      externalId: message.externalId,
      chatId: message.chatId,
      senderNumber: contactNumber,
      senderName: message.senderName ?? null,
      direction: "inbound",
      kind: message.kind,
      text: message.text,
      mediaPath: message.mediaPath ?? null,
      mimeType: message.mimeType ?? null,
      transcript: message.transcript ?? null,
      analysis: message.analysis ?? null,
      rawPayload: message.rawPayload ?? {},
      occurredAt: message.occurredAt,
      contactId: contact?.id ?? null,
      contactNumber,
      authorNumber: contactNumber,
      authorName: message.senderName ?? null,
      isFromMe: false
    });

    if (!inserted) {
      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "classification",
        summary: "Inbound message already recorded, continuing AI handling",
        payload: {
          disposition: "duplicate_record_only",
          senderNumber: contactNumber
        },
        requiredMode: "debug_basic"
      });
      await this.repository.addDecisionLog(
        message.externalId,
        "message_intake_duplicate_record",
        "Inbound message was already recorded before intake; continuing AI handling",
        {
          disposition: "duplicate_record_only"
        }
      );
    } else {
      await this.captureKnowledgeAsset(message, contactNumber);
    }

    const fastStoreOnlyDecision = getFastStoreOnlyDecision(message);
    if (fastStoreOnlyDecision) {
      const responseMode = fastStoreOnlyDecision.category === "NOISE" ? "ignore" : "history_only";
      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "classification",
        summary: "Inbound message skipped by deterministic preflight",
        payload: {
          disposition: fastStoreOnlyDecision.disposition,
          category: fastStoreOnlyDecision.category,
          reason: fastStoreOnlyDecision.reason,
          responseMode
        },
        requiredMode: "debug_basic"
      });

      await this.repository.addDecisionLog(
        message.externalId,
        "message_gate_history_only",
        responseMode === "ignore"
          ? "Ignored inbound message after deterministic preflight"
          : "Stored inbound message without planner wake-up",
        {
          action: "history_only",
          responseMode,
          category: fastStoreOnlyDecision.category,
          reason: fastStoreOnlyDecision.reason,
          kind: message.kind,
          isAddressedToAgent: !message.isGroupChat,
          shouldRespond: false,
          addressReason: message.isGroupChat ? "not_addressed" : "direct",
          reactionSource: "deterministic_preflight"
        }
      );
      return;
    }

    const [senderProfile, recentContext] = await Promise.all([
      this.repository.getContactByNumber(contactNumber),
      this.repository.getRecentContext(contactNumber)
    ]);
    const authorityContext = await this.authorityPolicyService.buildAuthorityContext({
      senderNumber: contactNumber,
      senderName: contact?.name ?? message.senderName ?? null,
      senderProfile
    });

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "classification",
      summary: "Prepared inbound context for reaction classification",
      payload: {
        senderNumber: contactNumber,
        hasSenderProfile: Boolean(senderProfile),
        senderAuthorityLevel: authorityContext.senderAuthorityLevel ?? null,
        senderIsHumanApi: authorityContext.senderIsHumanApi,
        singleSourceOfTruthNumber: authorityContext.singleSourceOfTruthContact?.whatsappNumber ?? null,
        recentMessageCount: recentContext.recentMessages?.length ?? 0,
        recentFactsCount: recentContext.facts?.length ?? 0
      },
      requiredMode: "debug_basic"
    });

    const normalizedMessage: InboundMessage = {
      ...message,
      senderNumber: contactNumber,
      senderName: contact?.name ?? message.senderName ?? null
    };

    const reactionDecision = await this.reactionClassifier.classify({
      message: normalizedMessage,
      senderProfile,
      recentContext,
      agentIdentity,
      authorityContext
    });

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "classification",
      summary: "Inbound reaction classified",
      payload: {
        addressedToAgent: reactionDecision.addressedToAgent,
        addressScope: reactionDecision.addressScope,
        responseMode: reactionDecision.responseMode,
        reactionType: reactionDecision.reactionType,
        shouldRecordMemory: reactionDecision.shouldRecordMemory,
        shouldCreateOrUpdateTask: reactionDecision.shouldCreateOrUpdateTask,
        needsHumanClarification: reactionDecision.needsHumanClarification,
        humanClarificationTarget: reactionDecision.humanClarificationTarget ?? null,
        webSearchAllowed: reactionDecision.webSearchAllowed,
        confidence: reactionDecision.confidence,
        reason: reactionDecision.reason,
        senderAuthorityLevel: authorityContext.senderAuthorityLevel ?? null,
        senderIsHumanApi: authorityContext.senderIsHumanApi
      },
      requiredMode: "debug_basic"
    });

    const shouldRespond = reactionDecision.responseMode === "reply_now";
    const plannerRequired = reactionDecision.responseMode === "reply_now" || reactionDecision.responseMode === "silent_review";
    const dispatchAction = plannerRequired
      ? this.downstreamHandler
        ? "planner_handoff"
        : "planner_unavailable"
      : "history_only";
    const decisionType =
      dispatchAction === "planner_handoff"
        ? "message_gate_planner_handoff"
        : dispatchAction === "planner_unavailable"
          ? "message_gate_planner_unavailable"
          : "message_gate_history_only";
    const summary =
      dispatchAction === "planner_handoff"
        ? shouldRespond
          ? "Reaction classifier required planner handoff for reply-now message"
          : "Reaction classifier required silent planner review without direct reply"
        : dispatchAction === "planner_unavailable"
          ? "Planner-required message could not be handed off"
          : reactionDecision.responseMode === "ignore"
            ? "Ignored inbound message after reaction classification"
            : "Stored inbound message without planner wake-up";

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "classification",
      summary: "Inbound reaction dispatch resolved",
      payload: {
        action: dispatchAction,
        responseMode: reactionDecision.responseMode,
        reactionType: reactionDecision.reactionType,
        isAddressedToAgent: reactionDecision.addressedToAgent,
        shouldRespond,
        addressReason: reactionDecision.addressScope,
        needsHumanClarification: reactionDecision.needsHumanClarification,
        webSearchAllowed: reactionDecision.webSearchAllowed
      },
      requiredMode: "debug_basic"
    });

    if (dispatchAction === "history_only" || dispatchAction === "planner_unavailable") {
      await this.repository.addDecisionLog(message.externalId, decisionType, summary, {
        action: dispatchAction,
        responseMode: reactionDecision.responseMode,
        reactionType: reactionDecision.reactionType,
        reason: reactionDecision.reason,
        confidence: reactionDecision.confidence,
        kind: message.kind,
        isAddressedToAgent: reactionDecision.addressedToAgent,
        shouldRespond,
        addressReason: reactionDecision.addressScope,
        needsHumanClarification: reactionDecision.needsHumanClarification,
        humanClarificationReason: reactionDecision.humanClarificationReason ?? null,
        humanClarificationTarget: reactionDecision.humanClarificationTarget ?? null,
        webSearchAllowed: reactionDecision.webSearchAllowed,
        shouldRecordMemory: reactionDecision.shouldRecordMemory,
        shouldCreateOrUpdateTask: reactionDecision.shouldCreateOrUpdateTask,
        authorityContext,
        reactionSource: "llm_step_1"
      });
      return;
    }

    await this.downstreamHandler.handleInboundMessage({
      ...normalizedMessage,
      reactionDecision,
      isAddressedToAgent: reactionDecision.addressedToAgent,
      shouldRespond,
      addressReason: reactionDecision.addressScope
    });

    await this.repository.addDecisionLog(message.externalId, decisionType, summary, {
      action: dispatchAction,
      responseMode: reactionDecision.responseMode,
      reactionType: reactionDecision.reactionType,
      reason: reactionDecision.reason,
      confidence: reactionDecision.confidence,
      contactId: contact?.id ?? null,
      isAddressedToAgent: reactionDecision.addressedToAgent,
      shouldRespond,
      addressReason: reactionDecision.addressScope,
      needsHumanClarification: reactionDecision.needsHumanClarification,
      humanClarificationReason: reactionDecision.humanClarificationReason ?? null,
      humanClarificationTarget: reactionDecision.humanClarificationTarget ?? null,
      webSearchAllowed: reactionDecision.webSearchAllowed,
      shouldRecordMemory: reactionDecision.shouldRecordMemory,
      shouldCreateOrUpdateTask: reactionDecision.shouldCreateOrUpdateTask,
      authorityContext,
      reactionSource: "llm_step_1"
    });

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "handoff",
      summary: "Inbound message dispatched to downstream handler",
      payload: {
        senderNumber: contactNumber,
        contactId: contact?.id ?? null,
        responseMode: reactionDecision.responseMode
      },
      requiredMode: "debug_basic"
    });
  }

  async handleOwnMessage(message: InboundMessage): Promise<void> {
    const agentIdentity = await this.agentIdentityService.getIdentity();
    const contactNumber = normalizePhoneNumber(message.senderNumber);
    const contact = await this.repository.ensureContactShell({
      whatsappNumber: contactNumber,
      whatsappLid: message.senderLid ?? null,
      name: message.senderName ?? contactNumber
    });

    await this.repository.saveStoredMessage({
      externalId: message.externalId,
      chatId: message.chatId,
      senderNumber: contactNumber,
      senderName: contact?.name ?? message.senderName ?? null,
      direction: "outbound",
      kind: message.kind,
      text: message.text,
      mediaPath: message.mediaPath ?? null,
      mimeType: message.mimeType ?? null,
      transcript: message.transcript ?? null,
      analysis: message.analysis ?? null,
      rawPayload: message.rawPayload ?? {},
      occurredAt: message.occurredAt,
      contactId: contact?.id ?? null,
      contactNumber,
      authorNumber: this.ownNumberResolver?.() ?? null,
      authorName: agentIdentity.name,
      isFromMe: true
    });
  }

  private async captureKnowledgeAsset(message: InboundMessage, senderNumber: string): Promise<void> {
    if (!message.mediaPath && !message.analysis && !message.transcript) {
      return;
    }

    const assetId = await this.repository.addKnowledgeAsset({
      sourceType: message.kind,
      sourceRef: message.mediaPath ?? `message:${message.externalId}`,
      title: message.text || `${message.kind} from ${message.senderName || senderNumber}`,
      mimeType: message.mimeType ?? null,
      textContent: [message.text, message.transcript, message.analysis].filter(Boolean).join("\n\n"),
      summary: message.analysis ?? message.transcript ?? null,
      metadata: {
        externalId: message.externalId,
        senderNumber,
        chatId: message.chatId
      },
      createdBy: senderNumber
    });

    await this.repository.upsertMemoryIndex({
      memoryKey: `knowledge_asset:${assetId}`,
      memoryType: "knowledge_asset",
      scopeType: message.isGroupChat ? "group_chat" : "contact",
      scopeId: message.isGroupChat ? message.chatId : senderNumber,
      title: message.text || `${message.kind} asset`,
      summary: (message.analysis ?? message.transcript ?? message.text ?? "").slice(0, 600),
      sourceTable: "knowledge_assets",
      sourceRef: String(assetId),
      tags: [message.kind, message.mimeType ?? "unknown"],
      entities: [message.senderName ?? "", senderNumber].filter(Boolean),
      importanceScore: 0.7,
      freshnessScore: 0.95,
      confidence: 0.8,
      metadata: {
        externalId: message.externalId,
        chatId: message.chatId
      }
    });
  }
}
