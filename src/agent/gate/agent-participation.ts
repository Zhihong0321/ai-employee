import { buildNormalizedMessageText } from "../intake.js";
import { InboundMessage } from "../../types.js";
import { InboundGateResult } from "./inbound-message-gate.js";

export type AgentParticipationResult = {
  action: "history_only" | "planner_required";
  shouldRespond: boolean;
  isAddressedToAgent: boolean;
  addressReason: "direct_pm" | "bot_mentioned" | "group_wide_request" | "group_not_addressed";
  reason: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeAliasCandidates(botName: string, botAliases: string[]): string[] {
  return [botName, ...botAliases]
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function hasAgentMention(text: string, botName: string, botAliases: string[]): boolean {
  const normalizedText = text.toLowerCase();
  const aliases = normalizeAliasCandidates(botName, botAliases);

  return aliases.some((alias) => {
    const escapedAlias = escapeRegex(alias);
    const mentionPattern = new RegExp(`(^|[^\\p{L}\\p{N}_])@?${escapedAlias}(?=$|[^\\p{L}\\p{N}_])`, "iu");
    return mentionPattern.test(normalizedText);
  });
}

function hasGroupWideAddress(text: string): boolean {
  const normalizedText = text.toLowerCase();
  const patterns = [
    /\bevery\s*1\b/i,
    /\beveryone\b/i,
    /\bevery one\b/i,
    /\beverybody\b/i,
    /\ball of you\b/i,
    /\beach of you\b/i,
    /\banyone in this group\b/i,
    /\ball in this group\b/i,
    /\beveryone in this group\b/i,
    /\bevery one in this group\b/i,
    /\bevery\s*1 in this group\b/i,
    /\beach person in this group\b/i,
    /\beach member in this group\b/i
  ];

  return patterns.some((pattern) => pattern.test(normalizedText));
}

function shouldSilentlyReviewGroupMessage(gateResult: InboundGateResult): boolean {
  return (
    gateResult.intent === "instruction_review" ||
    gateResult.intent === "fact_update_review" ||
    gateResult.intent === "clarification_review"
  );
}

function shouldEscalateDirectPmToPlanner(message: InboundMessage, gateResult: InboundGateResult): boolean {
  return (
    !message.isGroupChat &&
    gateResult.action === "history_only" &&
    gateResult.category === "CASUAL_CHAT" &&
    buildNormalizedMessageText(message).trim().length > 0
  );
}

export function resolveAgentParticipation(
  message: InboundMessage,
  gateResult: InboundGateResult,
  identity: {
    botName: string;
    botAliases?: string[];
  }
): AgentParticipationResult {
  if (!message.isGroupChat) {
    if (shouldEscalateDirectPmToPlanner(message, gateResult)) {
      return {
        action: "planner_required",
        shouldRespond: true,
        isAddressedToAgent: true,
        addressReason: "direct_pm",
        reason: "direct_pm_casual_chat_escalates_to_reply_path"
      };
    }

    return {
      action: gateResult.action,
      shouldRespond: gateResult.action === "planner_required",
      isAddressedToAgent: true,
      addressReason: "direct_pm",
      reason: "direct_pm_defaults_to_active_participation"
    };
  }

  const normalizedText = buildNormalizedMessageText(message);
  const isAddressedToAgent = hasAgentMention(normalizedText, identity.botName, identity.botAliases ?? []);
  const isGroupWideRequest =
    gateResult.action === "planner_required" &&
    gateResult.intent !== "clarification_review" &&
    hasGroupWideAddress(normalizedText);

  if (isAddressedToAgent) {
    return {
      action: gateResult.action,
      shouldRespond: gateResult.action === "planner_required",
      isAddressedToAgent: true,
      addressReason: "bot_mentioned",
      reason: "group_message_explicitly_addresses_agent"
    };
  }

  if (isGroupWideRequest) {
    return {
      action: gateResult.action,
      shouldRespond: gateResult.action === "planner_required",
      isAddressedToAgent: true,
      addressReason: "group_wide_request",
      reason: "group_message_addresses_all_members_including_agent"
    };
  }

  if (gateResult.action === "planner_required" && shouldSilentlyReviewGroupMessage(gateResult)) {
    return {
      action: "planner_required",
      shouldRespond: false,
      isAddressedToAgent: false,
      addressReason: "group_not_addressed",
      reason: "group_message_contains_important_context_for_silent_review"
    };
  }

  return {
    action: "history_only",
    shouldRespond: false,
    isAddressedToAgent: false,
    addressReason: "group_not_addressed",
    reason: "group_message_not_addressed_to_agent"
  };
}
