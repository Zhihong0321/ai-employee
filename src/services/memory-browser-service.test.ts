import test from "node:test";
import assert from "node:assert/strict";
import { MemoryBrowserService } from "./memory-browser-service.js";

class FakeRepository {
  public browseCalls: any[] = [];
  public touchCalls: any[] = [];

  async browseMemoryIndex(input: any): Promise<any[]> {
    this.browseCalls.push(input);
    return [
      {
        memoryKey: "fact:meeting:time",
        memoryType: "fact",
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        title: "Meeting time",
        summary: "Meeting moved to 4pm today",
        sourceTable: "facts",
        sourceRef: "meeting:time",
        tags: ["meeting", "time"],
        entities: ["meeting"],
        importanceScore: 0.9,
        freshnessScore: 0.8,
        confidence: 0.95,
        metadata: {}
      }
    ];
  }

  async listTasksForContact(): Promise<any[]> {
    return [{ id: 10, title: "Follow up on meeting" }];
  }

  async getRecentContext(): Promise<any> {
    return {
      recentMessages: [{ text_content: "What is the meeting time?" }],
      contacts: [],
      facts: [{ fact_key: "meeting:time", value: "4pm today" }]
    };
  }

  async touchMemoryIndex(memoryKeys: string[]): Promise<void> {
    this.touchCalls.push(memoryKeys);
  }
}

test("memory browser assembles scoped evidence pack and touches selected memory", async () => {
  const repository = new FakeRepository();
  const service = new MemoryBrowserService(repository as any);

  const result = await service.buildInboundEvidencePack({
    externalId: "msg-1",
    chatId: "120363000000000000@g.us",
    isGroupChat: true,
    senderNumber: "60123456789",
    senderName: "Sam",
    kind: "text",
    text: "What time is the meeting?",
    rawPayload: {},
    occurredAt: new Date("2026-04-06T00:00:00.000Z")
  });

  assert.equal(result.scopeType, "group_chat");
  assert.equal(result.scopeId, "120363000000000000@g.us");
  assert.equal(result.relevantMemories.length, 1);
  assert.equal(result.activeTasks.length, 1);
  assert.equal(repository.browseCalls.length, 1);
  assert.deepEqual(repository.touchCalls[0], ["fact:meeting:time"]);
});
