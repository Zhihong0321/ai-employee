import test from "node:test";
import assert from "node:assert/strict";
import { RecentExternalIdCache, getIntakeGatewayPreflight } from "./preflight.js";
import { InboundMessage } from "../../types.js";

function buildInboundMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    externalId: "msg-123",
    chatId: "60123456789@s.whatsapp.net",
    isGroupChat: false,
    senderNumber: "60123456789",
    kind: "image",
    text: "Please review this",
    transcript: null,
    analysis: null,
    mimeType: "image/jpeg",
    mediaPath: null,
    rawPayload: {
      key: {
        remoteJid: "60123456789@s.whatsapp.net"
      },
      message: {
        imageMessage: {
          caption: "Please review this"
        }
      }
    },
    occurredAt: new Date("2026-04-02T00:00:00.000Z"),
    ...overrides
  };
}

test("gateway preflight skips enrichment for recent duplicate external ids", () => {
  const cache = new RecentExternalIdCache(60_000);
  const message = buildInboundMessage();

  cache.remember(message.externalId);
  const preflight = getIntakeGatewayPreflight(message, cache);

  assert.equal(preflight.isRecentDuplicate, true);
  assert.equal(preflight.fastStoreOnlyDecision, null);
  assert.equal(preflight.shouldSkipMediaEnrichment, true);
});

test("gateway preflight skips enrichment for deterministic protocol noise", () => {
  const cache = new RecentExternalIdCache(60_000);
  const message = buildInboundMessage({
    externalId: "msg-noise",
    kind: "unknown",
    text: "",
    rawPayload: {
      key: {
        remoteJid: "60123456789@s.whatsapp.net"
      },
      message: {
        reactionMessage: {
          key: {
            id: "abc123"
          }
        }
      }
    }
  });

  const preflight = getIntakeGatewayPreflight(message, cache);

  assert.equal(preflight.isRecentDuplicate, false);
  assert.equal(preflight.fastStoreOnlyDecision?.reason, "reaction_message");
  assert.equal(preflight.shouldSkipMediaEnrichment, true);
});

test("gateway preflight allows enrichment for first-seen actionable media", () => {
  const cache = new RecentExternalIdCache(60_000);
  const message = buildInboundMessage();

  const preflight = getIntakeGatewayPreflight(message, cache);

  assert.equal(preflight.isRecentDuplicate, false);
  assert.equal(preflight.fastStoreOnlyDecision, null);
  assert.equal(preflight.shouldSkipMediaEnrichment, false);
});

test("recent external id cache expires old entries", () => {
  const cache = new RecentExternalIdCache(1_000);
  cache.remember("old-msg", 1_000);

  assert.equal(cache.has("old-msg", 1_900), true);
  assert.equal(cache.has("old-msg", 2_100), false);
  assert.equal(cache.size(), 0);
});
