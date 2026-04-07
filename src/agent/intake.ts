import { InboundMessage, IntakeDecision } from "../types.js";
import { getNormalizedBaileysMessageKeys } from "./intake/baileys-message.js";

const CASUAL_CHAT_EXACT_MATCHES = new Set([
  "hi",
  "hello",
  "hey",
  "good morning",
  "good afternoon",
  "good evening",
  "ok",
  "okay",
  "ok thanks",
  "okay thanks",
  "thanks",
  "thank you",
  "noted",
  "got it",
  "understood",
  "alright",
  "sure"
]);

const SHORT_ACK_EXACT_MATCHES = new Set([
  "done",
  "done already",
  "sent",
  "sent already",
  "received",
  "on it",
  "working on it",
  "will do",
  "gotcha"
]);

const TASK_ACTION_PATTERNS = [
  /^(please\s+)?remind\b/i,
  /^(please\s+)?send\b/i,
  /^(please\s+)?create\b/i,
  /^(please\s+)?schedule\b/i,
  /^(please\s+)?follow\s+up\b/i,
  /^(please\s+)?check\b/i,
  /^(please\s+)?ask\b/i,
  /^(please\s+)?message\b/i,
  /^(please\s+)?notify\b/i,
  /^(please\s+)?share\b/i,
  /^(please\s+)?update\b/i,
  /^(please\s+)?prepare\b/i,
  /^(please\s+)?draft\b/i,
  /\bcan you remind\b/i,
  /\bcould you remind\b/i,
  /\bcan you send\b/i,
  /\bcould you send\b/i,
  /\bcan you create\b/i,
  /\bcould you create\b/i,
  /\bcan you schedule\b/i,
  /\bcould you schedule\b/i,
  /\bcan you follow up\b/i,
  /\bcould you follow up\b/i,
  /\bcan you check\b/i,
  /\bcould you check\b/i,
  /\bplease ask\b/i
];

const KNOWLEDGE_QUERY_PATTERNS = [
  /^\s*(what|where|when|who|why|how|which)\b/i,
  /^\s*(is|are|do|does|did|have|has|can|could|would|will)\b.*\?/i,
  /^\s*can you tell me\b/i,
  /^\s*could you tell me\b/i,
  /^\s*please tell me\b/i,
  /\bstatus of\b/i
];

const INSTRUCTION_POLICY_CUE_PATTERNS = [
  /^\s*from now on\b/i,
  /^\s*treat\b.+\bas\b/i,
  /^\s*consider\b.+\bas\b/i,
  /^\s*use\b.+\bas\b/i,
  /^\s*mark\b.+\bas\b/i,
  /^\s*save\b.+\bas\b/i
];

const FACT_UPDATE_CUE_PATTERNS = [
  /^\s*remember that\b/i,
  /^\s*for your record\b/i,
  /^\s*this number is\b/i,
  /^\s*the new\b/i,
  /\bis our new\b/i,
  /\bhas changed to\b/i,
  /\bshould be recorded as\b/i
];

const CLARIFICATION_CUE_PATTERNS = [
  /^\s*actually\b/i,
  /^\s*correction[:\s]/i,
  /^\s*to clarify\b/i,
  /^\s*no[, ]+(not|it'?s not|that'?s not)\b/i,
  /\bnot\s+.+\b(?:it'?s|it is|but)\b/i,
  /\bthat'?s not correct\b/i,
  /\bthat'?s wrong\b/i,
  /\binstead\b/i
];

function getRawMessageKeys(message: Pick<InboundMessage, "rawPayload">): string[] {
  return getNormalizedBaileysMessageKeys((message.rawPayload as any)?.message);
}

export function buildNormalizedMessageText(message: Pick<InboundMessage, "text" | "transcript" | "analysis">): string {
  return [message.text, message.transcript, message.analysis].filter(Boolean).join("\n\n").trim();
}

function normalizePlainText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function getDeterministicStructuredDecision(
  message: Pick<InboundMessage, "text" | "transcript" | "analysis" | "mediaPath">
): IntakeDecision | null {
  const normalizedText = buildNormalizedMessageText(message);
  if (!normalizedText) {
    return null;
  }

  const plainText = normalizePlainText(normalizedText);
  if (!message.mediaPath && CASUAL_CHAT_EXACT_MATCHES.has(plainText)) {
    return {
      disposition: "store_only",
      category: "CASUAL_CHAT",
      reason: "casual_chat_exact_match",
      normalizedText
    };
  }

  if (!message.mediaPath && SHORT_ACK_EXACT_MATCHES.has(plainText)) {
    return {
      disposition: "store_only",
      category: "CASUAL_CHAT",
      reason: "short_acknowledgement_exact_match",
      normalizedText
    };
  }

  if (matchesAnyPattern(normalizedText, TASK_ACTION_PATTERNS)) {
    return {
      disposition: "dispatch",
      category: "TASK_ACTION",
      reason: "task_action_pattern_match",
      normalizedText
    };
  }

  if (normalizedText.includes("?") || matchesAnyPattern(normalizedText, KNOWLEDGE_QUERY_PATTERNS)) {
    return {
      disposition: "dispatch",
      category: "KNOWLEDGE_QUERY",
      reason: "knowledge_query_pattern_match",
      normalizedText
    };
  }

  if (matchesAnyPattern(normalizedText, INSTRUCTION_POLICY_CUE_PATTERNS)) {
    return {
      disposition: "dispatch",
      category: "UNKNOWN",
      reason: "instruction_policy_cue_detected",
      normalizedText
    };
  }

  if (matchesAnyPattern(normalizedText, FACT_UPDATE_CUE_PATTERNS)) {
    return {
      disposition: "dispatch",
      category: "UNKNOWN",
      reason: "fact_update_cue_detected",
      normalizedText
    };
  }

  if (matchesAnyPattern(normalizedText, CLARIFICATION_CUE_PATTERNS)) {
    return {
      disposition: "dispatch",
      category: "UNKNOWN",
      reason: "clarification_cue_detected",
      normalizedText
    };
  }

  return null;
}

export function getFastStoreOnlyDecision(
  message: Pick<InboundMessage, "rawPayload" | "kind" | "text" | "transcript" | "analysis">
): IntakeDecision | null {
  const normalizedText = buildNormalizedMessageText(message);
  const raw = message.rawPayload as any;
  const remoteJid = raw?.key?.remoteJid ?? raw?.key?.remoteJidAlt ?? "";
  const messageKeys = getRawMessageKeys(message);

  if (remoteJid === "status@broadcast") {
    return {
      disposition: "store_only",
      category: "NOISE",
      reason: "status_broadcast",
      normalizedText
    };
  }

  if (messageKeys.includes("protocolMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "protocol_message",
      normalizedText
    };
  }

  if (messageKeys.includes("reactionMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "reaction_message",
      normalizedText
    };
  }

  if (messageKeys.includes("pollUpdateMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "poll_update",
      normalizedText
    };
  }

  if (messageKeys.includes("senderKeyDistributionMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "sender_key_distribution_message",
      normalizedText
    };
  }

  if (messageKeys.includes("buttonsResponseMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "buttons_response_message",
      normalizedText
    };
  }

  if (messageKeys.includes("listResponseMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "list_response_message",
      normalizedText
    };
  }

  if (messageKeys.includes("templateButtonReplyMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "template_button_reply_message",
      normalizedText
    };
  }

  if (messageKeys.includes("interactiveResponseMessage")) {
    return {
      disposition: "store_only",
      category: "PROTOCOL_RESPONSE",
      reason: "interactive_response_message",
      normalizedText
    };
  }

  if (message.kind === "unknown" && !normalizedText) {
    return {
      disposition: "store_only",
      category: "NOISE",
      reason: "unknown_empty_payload",
      normalizedText
    };
  }

  return null;
}

export function getDeterministicIntakeDecision(message: InboundMessage): IntakeDecision {
  const fastStoreOnlyDecision = getFastStoreOnlyDecision(message);
  if (fastStoreOnlyDecision) {
    return fastStoreOnlyDecision;
  }

  const normalizedText = buildNormalizedMessageText(message);
  const structuredDecision = getDeterministicStructuredDecision(message);
  if (structuredDecision) {
    return structuredDecision;
  }

  if (!normalizedText && !message.mediaPath) {
    return {
      disposition: "store_only",
      category: "NOISE",
      reason: "empty_message",
      normalizedText
    };
  }

  return {
    disposition: "dispatch",
    category: "UNKNOWN",
    reason: "potentially_actionable",
    normalizedText
  };
}
