import test from "node:test";
import assert from "node:assert/strict";
import {
  detectBaileysMessageKind,
  extractBaileysMessageText,
  extractBaileysMimeType,
  getNormalizedBaileysMessageKeys,
  unwrapBaileysMessageContent
} from "./baileys-message.js";
import { getDeterministicIntakeDecision } from "../intake.js";
import { getFastStoreOnlyDecision } from "../intake.js";
import { InboundMessage } from "../../types.js";

function buildInboundMessage(rawMessage: unknown): InboundMessage {
  return {
    externalId: "msg-1",
    chatId: "60123456789@s.whatsapp.net",
    isGroupChat: false,
    senderNumber: "60123456789",
    kind: "unknown",
    text: "",
    rawPayload: {
      message: rawMessage
    },
    occurredAt: new Date("2026-04-02T00:00:00.000Z")
  };
}

test("unwrapBaileysMessageContent resolves ephemeral document captions", () => {
  const raw = {
    ephemeralMessage: {
      message: {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              caption: "Quarterly report",
              mimetype: "application/pdf"
            }
          }
        }
      }
    }
  };

  const content = unwrapBaileysMessageContent(raw);
  assert.deepEqual(Object.keys(content), ["documentMessage"]);
  assert.equal(detectBaileysMessageKind(raw), "document");
  assert.equal(extractBaileysMessageText(raw), "Quarterly report");
  assert.equal(extractBaileysMimeType(raw), "application/pdf");
});

test("helpers keep interactive text replies in the normalized intake shape", () => {
  const raw = {
    viewOnceMessageV2: {
      message: {
        buttonsResponseMessage: {
          selectedDisplayText: "Yes, confirm"
        }
      }
    }
  };

  assert.equal(detectBaileysMessageKind(raw), "text");
  assert.equal(extractBaileysMessageText(raw), "Yes, confirm");
  assert.deepEqual(getNormalizedBaileysMessageKeys(raw), ["buttonsResponseMessage"]);
});

test("deterministic intake sees wrapped protocol messages before downstream dispatch", () => {
  const message = buildInboundMessage({
    ephemeralMessage: {
      message: {
        protocolMessage: {
          type: 0
        }
      }
    }
  });

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "store_only");
  assert.equal(decision.category, "PROTOCOL_RESPONSE");
  assert.equal(decision.reason, "protocol_message");
});

test("fast store-only check rejects wrapped status noise before media enrichment", () => {
  const message = buildInboundMessage({
    reactionMessage: {
      key: {
        id: "abc123"
      }
    }
  });

  const decision = getFastStoreOnlyDecision(message);
  assert.ok(decision);
  assert.equal(decision?.disposition, "store_only");
  assert.equal(decision?.reason, "reaction_message");
});

test("fast store-only check rejects sender key distribution messages", () => {
  const message = buildInboundMessage({
    senderKeyDistributionMessage: {
      groupId: "120363000000000000@g.us"
    }
  });

  const decision = getFastStoreOnlyDecision(message);
  assert.ok(decision);
  assert.equal(decision?.category, "PROTOCOL_RESPONSE");
  assert.equal(decision?.reason, "sender_key_distribution_message");
});

test("fast store-only check treats buttons response messages as protocol responses", () => {
  const message = {
    ...buildInboundMessage({
      buttonsResponseMessage: {
        selectedDisplayText: "Yes, confirm"
      }
    }),
    kind: "text" as const,
    text: "Yes, confirm"
  };

  const decision = getFastStoreOnlyDecision(message);
  assert.ok(decision);
  assert.equal(decision?.category, "PROTOCOL_RESPONSE");
  assert.equal(decision?.reason, "buttons_response_message");
});

test("fast store-only check treats list response messages as protocol responses", () => {
  const message = {
    ...buildInboundMessage({
      listResponseMessage: {
        title: "Option 2",
        singleSelectReply: {
          selectedRowId: "option-2"
        }
      }
    }),
    kind: "text" as const,
    text: "Option 2"
  };

  const decision = getFastStoreOnlyDecision(message);
  assert.ok(decision);
  assert.equal(decision?.category, "PROTOCOL_RESPONSE");
  assert.equal(decision?.reason, "list_response_message");
});

test("deterministic intake keeps obvious casual chat on the history-only path", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "ok thanks"
    }),
    kind: "text" as const,
    text: "ok thanks"
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "store_only");
  assert.equal(decision.category, "CASUAL_CHAT");
  assert.equal(decision.reason, "casual_chat_exact_match");
});

test("deterministic intake promotes obvious knowledge questions without classifier help", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "What is the meeting time today?"
    }),
    kind: "text" as const,
    text: "What is the meeting time today?"
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "dispatch");
  assert.equal(decision.category, "KNOWLEDGE_QUERY");
  assert.equal(decision.reason, "knowledge_query_pattern_match");
});

test("deterministic intake promotes obvious task requests without classifier help", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "Please send the report to HR"
    }),
    kind: "text" as const,
    text: "Please send the report to HR"
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "dispatch");
  assert.equal(decision.category, "TASK_ACTION");
  assert.equal(decision.reason, "task_action_pattern_match");
});

test("deterministic intake keeps obvious clarification cues actionable without classifier help", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "Actually, not Tuesday, it is Wednesday."
    }),
    kind: "text" as const,
    text: "Actually, not Tuesday, it is Wednesday."
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "dispatch");
  assert.equal(decision.category, "UNKNOWN");
  assert.equal(decision.reason, "clarification_cue_detected");
});

test("deterministic intake keeps short acknowledgements on the history-only path", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "done"
    }),
    kind: "text" as const,
    text: "done"
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "store_only");
  assert.equal(decision.category, "CASUAL_CHAT");
  assert.equal(decision.reason, "short_acknowledgement_exact_match");
});

test("deterministic intake keeps obvious fact update cues actionable without classifier help", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "This number is our new HR contact."
    }),
    kind: "text" as const,
    text: "This number is our new HR contact."
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "dispatch");
  assert.equal(decision.category, "UNKNOWN");
  assert.equal(decision.reason, "fact_update_cue_detected");
});

test("deterministic intake keeps instruction policy cues actionable without classifier help", () => {
  const message = {
    ...buildInboundMessage({
      conversation: "From now on treat this number as HR."
    }),
    kind: "text" as const,
    text: "From now on treat this number as HR."
  };

  const decision = getDeterministicIntakeDecision(message);
  assert.equal(decision.disposition, "dispatch");
  assert.equal(decision.category, "UNKNOWN");
  assert.equal(decision.reason, "instruction_policy_cue_detected");
});
