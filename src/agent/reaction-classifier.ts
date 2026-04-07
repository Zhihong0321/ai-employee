import { buildAgentAbilityProfile } from "../lib/agent-ability.js";
import { LlmRouter } from "../llm/llm-router.js";
import { PromptRegistry } from "../prompts/prompt-registry.js";
import { AgentIdentity, AuthorityContext, InboundMessage, ReactionDecision } from "../types.js";
import { buildNormalizedMessageText, getDeterministicIntakeDecision, getFastStoreOnlyDecision } from "./intake.js";

export class ReactionClassifier {
  constructor(
    private readonly llmRouter: LlmRouter,
    private readonly promptRegistry: PromptRegistry
  ) {}

  async classify(input: {
    message: InboundMessage;
    senderProfile: unknown;
    recentContext: unknown;
    agentIdentity: AgentIdentity;
    authorityContext?: AuthorityContext | null;
  }): Promise<ReactionDecision> {
    if (!this.llmRouter.isConfigured()) {
      return this.buildFallbackDecision(input.message);
    }

    const promptPack = await this.promptRegistry.getActivePromptPack("reaction-classifier");
    const normalizedText = buildNormalizedMessageText(input.message);
    const abilityProfile = buildAgentAbilityProfile();

    try {
      return await this.llmRouter.generateJson<ReactionDecision>({
        systemPrompt: promptPack.systemPrompt,
        schemaDescription: promptPack.schemaDescription,
        temperature: 0.1,
        prompt: JSON.stringify(
          {
            message: {
              externalId: input.message.externalId,
              chatId: input.message.chatId,
              isGroupChat: input.message.isGroupChat,
              senderNumber: input.message.senderNumber,
              senderName: input.message.senderName ?? null,
              text: input.message.text,
              transcript: input.message.transcript ?? null,
              analysis: input.message.analysis ?? null,
              normalizedText,
              kind: input.message.kind,
              groupContext: input.message.groupContext ?? null
            },
            senderProfile: input.senderProfile,
            recentContext: input.recentContext,
            agentIdentity: input.agentIdentity,
            authorityContext: input.authorityContext ?? null,
            abilityProfile
          },
          null,
          2
        ),
        traceMetadata: {
          messageExternalId: input.message.externalId,
          stage: "reaction_classification",
          promptKey: promptPack.promptKey,
          manifestName: promptPack.manifestName,
          promptVersion: promptPack.version,
          promptVersionHash: promptPack.versionHash
        }
      });
    } catch {
      return this.buildFallbackDecision(input.message);
    }
  }

  private buildFallbackDecision(message: InboundMessage): ReactionDecision {
    const fastStoreOnly = getFastStoreOnlyDecision(message);
    if (fastStoreOnly) {
      return {
        addressedToAgent: !message.isGroupChat,
        addressScope: message.isGroupChat ? "not_addressed" : "direct",
        responseMode: fastStoreOnly.category === "NOISE" ? "ignore" : "history_only",
        reactionType: "casual_chat",
        shouldRecordMemory: false,
        shouldCreateOrUpdateTask: false,
        needsHumanClarification: false,
        humanClarificationReason: null,
        humanClarificationTarget: null,
        webSearchAllowed: false,
        confidence: 0.6,
        reason: `fallback_fast_store_only:${fastStoreOnly.reason}`
      };
    }

    const deterministic = getDeterministicIntakeDecision(message);
    if (!message.isGroupChat) {
      return {
        addressedToAgent: true,
        addressScope: "direct",
        responseMode: "reply_now",
        reactionType: this.mapReactionType(deterministic.category, deterministic.reason),
        shouldRecordMemory: true,
        shouldCreateOrUpdateTask: deterministic.category === "TASK_ACTION",
        needsHumanClarification: false,
        humanClarificationReason: null,
        humanClarificationTarget: null,
        webSearchAllowed: deterministic.category === "KNOWLEDGE_QUERY",
        confidence: 0.55,
        reason: "fallback_direct_pm_reply"
      };
    }

    return {
      addressedToAgent: false,
      addressScope: "not_addressed",
      responseMode: this.isSilentReviewCandidate(deterministic.reason) ? "silent_review" : "history_only",
      reactionType: this.mapReactionType(deterministic.category, deterministic.reason),
      shouldRecordMemory: true,
      shouldCreateOrUpdateTask: deterministic.category === "TASK_ACTION",
      needsHumanClarification: false,
      humanClarificationReason: null,
      humanClarificationTarget: null,
      webSearchAllowed: false,
      confidence: 0.45,
      reason: "fallback_group_conservative_handling"
    };
  }

  private mapReactionType(category: string, reason: string): ReactionDecision["reactionType"] {
    if (category === "TASK_ACTION") {
      return "task_request";
    }
    if (category === "KNOWLEDGE_QUERY") {
      return "question";
    }
    if (reason === "fact_update_cue_detected") {
      return "fact_update";
    }
    if (reason === "instruction_policy_cue_detected") {
      return "instruction";
    }
    if (reason === "clarification_cue_detected") {
      return "clarification";
    }
    if (category === "CASUAL_CHAT") {
      return "casual_chat";
    }
    return "unknown";
  }

  private isSilentReviewCandidate(reason: string): boolean {
    return (
      reason === "fact_update_cue_detected" ||
      reason === "instruction_policy_cue_detected" ||
      reason === "clarification_cue_detected"
    );
  }
}
