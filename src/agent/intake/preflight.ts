import { InboundMessage, IntakeDecision } from "../../types.js";
import { getFastStoreOnlyDecision } from "../intake.js";

export type IntakeGatewayPreflight = {
  isRecentDuplicate: boolean;
  fastStoreOnlyDecision: IntakeDecision | null;
  shouldSkipMediaEnrichment: boolean;
};

export class RecentExternalIdCache {
  private readonly seenAt = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  has(externalId: string, now = Date.now()): boolean {
    const seenAt = this.seenAt.get(externalId);
    if (!seenAt) {
      return false;
    }

    if (now - seenAt > this.ttlMs) {
      this.seenAt.delete(externalId);
      return false;
    }

    return true;
  }

  remember(externalId: string, now = Date.now()): void {
    this.prune(now);
    this.seenAt.set(externalId, now);
  }

  forget(externalId: string): void {
    this.seenAt.delete(externalId);
  }

  size(): number {
    return this.seenAt.size;
  }

  private prune(now: number): void {
    const cutoff = now - this.ttlMs;
    for (const [externalId, seenAt] of this.seenAt.entries()) {
      if (seenAt < cutoff) {
        this.seenAt.delete(externalId);
      }
    }
  }
}

export function getIntakeGatewayPreflight(
  message: Pick<InboundMessage, "externalId" | "rawPayload" | "kind" | "text" | "transcript" | "analysis">,
  recentExternalIds: RecentExternalIdCache
): IntakeGatewayPreflight {
  const isRecentDuplicate = recentExternalIds.has(message.externalId);
  const fastStoreOnlyDecision = getFastStoreOnlyDecision(message);

  return {
    isRecentDuplicate,
    fastStoreOnlyDecision,
    shouldSkipMediaEnrichment: isRecentDuplicate || Boolean(fastStoreOnlyDecision)
  };
}
