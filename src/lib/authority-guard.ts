import { normalizePhoneNumber } from "./phone.js";
import { AgentPlan, AuthorityContext } from "../types.js";

const SENSITIVE_AUTHORITY_PATTERNS = [
  /\bdon t listen to\b/i,
  /\bdo not listen to\b/i,
  /\bignore\b.+\b(communications|messages|instructions|requests)\b/i,
  /\bignore\b.+\bfrom\b/i,
  /\bstop responding to\b/i,
  /\bdo not respond to\b/i,
  /\bdon t trust\b/i,
  /\boverride\b.+\bauthorit/i,
  /\bchange\b.+\b(role|authority|org chart|organization chart)\b/i,
  /\bupdate\b.+\b(role|authority|org chart|organization chart)\b/i,
  /\bremove\b.+\b(authority|access|trust)\b/i
];

function normalizePlainText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSensitiveAuthorityInstruction(text: string): boolean {
  const normalized = normalizePlainText(String(text ?? ""));
  if (!normalized) {
    return false;
  }

  return SENSITIVE_AUTHORITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isAuthorizedForSensitiveChange(context: AuthorityContext): boolean {
  const senderNumber = normalizePhoneNumber(context.senderNumber);
  const singleSourceNumber = normalizePhoneNumber(context.singleSourceOfTruthContact?.whatsappNumber ?? "");
  const initiatorNumber = normalizePhoneNumber(context.initiatorContact?.whatsappNumber ?? "");
  const senderAuthorityLevel = Number(context.senderAuthorityLevel ?? 0);

  if (context.requireSingleSourceOfTruthForSensitiveChanges && singleSourceNumber) {
    return senderNumber === singleSourceNumber;
  }

  if (singleSourceNumber && senderNumber === singleSourceNumber) {
    return true;
  }

  if (initiatorNumber && senderNumber === initiatorNumber) {
    return true;
  }

  return context.senderIsHumanApi && senderAuthorityLevel >= 5;
}

function buildDeniedReply(context: AuthorityContext): string {
  const singleSourceName = context.singleSourceOfTruthContact?.name?.trim();
  const singleSourceNumber = context.singleSourceOfTruthContact?.whatsappNumber?.trim();
  const initiatorName = context.initiatorContact?.name?.trim();

  if (singleSourceName || singleSourceNumber) {
    return `I can't change trust, authority, or ignore rules based on this request alone. If this is an official instruction, please ask ${singleSourceName ?? singleSourceNumber} to confirm it first.`;
  }

  if (initiatorName) {
    return `I can't change trust, authority, or ignore rules based on this request alone. If this is an official instruction, please ask ${initiatorName} to confirm it first.`;
  }

  return "I can't change trust, authority, or ignore rules based on this request alone. Please have an authorized owner confirm the instruction first.";
}

export function applySensitiveAuthorityGuard(input: {
  normalizedText: string;
  context: AuthorityContext;
  plan: AgentPlan;
}): { blocked: boolean; reason?: string; plan: AgentPlan } {
  if (!isSensitiveAuthorityInstruction(input.normalizedText)) {
    return {
      blocked: false,
      plan: input.plan
    };
  }

  if (isAuthorizedForSensitiveChange(input.context)) {
    return {
      blocked: false,
      plan: input.plan
    };
  }

  return {
    blocked: true,
    reason: "unauthorized_sensitive_authority_change",
    plan: {
      category: "discussion",
      summary: "Blocked unauthorized sensitive authority-change request pending authorized confirmation.",
      replyText: buildDeniedReply(input.context),
      claims: [],
      contactUpdates: [],
      facts: [],
      tasks: [],
      reminders: [],
      outboundMessages: [],
      clarification: {
        needed: false
      },
      companyQuery: null,
      webSearchQuery: null
    }
  };
}
