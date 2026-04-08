import test from "node:test";
import assert from "node:assert/strict";
import { MemoryOptimizerService } from "./memory-optimizer-service.js";

class FakeRepository {
  public task: any = null;
  public events: any[] = [];
  public addedEvents: any[] = [];
  public archivedCalls: any[] = [];
  public snapshotUpdates: any[] = [];
  public factWrites: any[] = [];
  public memoryIndexWrites: any[] = [];
  public optimizationMetaTaskIds: number[] = [];
  public summaryEventId = 999;

  async getTaskById(taskId: number): Promise<any | null> {
    return this.task?.id === taskId ? this.task : null;
  }

  async getAllTaskEvents(taskId: number): Promise<any[]> {
    return this.task?.id === taskId ? this.events : [];
  }

  async addTaskEvent(taskId: number, eventType: string, content: Record<string, unknown>): Promise<void> {
    this.addedEvents.push({ taskId, eventType, content });
  }

  async getLatestTaskSummaryEvent(taskId: number): Promise<any | null> {
    const wroteSummary = this.addedEvents.some((event) => event.taskId === taskId && event.eventType === "TASK_SUMMARY");
    return wroteSummary ? { id: this.summaryEventId } : null;
  }

  async archiveTaskEventsBeforeId(taskId: number, checkpointEventId: number): Promise<number> {
    this.archivedCalls.push({ taskId, checkpointEventId });
    return 7;
  }

  async updateTaskSnapshot(input: any): Promise<void> {
    this.snapshotUpdates.push(input);
  }

  async upsertFact(input: any): Promise<void> {
    this.factWrites.push(input);
  }

  async upsertMemoryIndex(input: any): Promise<number> {
    this.memoryIndexWrites.push(input);
    return this.memoryIndexWrites.length;
  }

  async setTaskOptimizationMeta(taskId: number): Promise<void> {
    this.optimizationMetaTaskIds.push(taskId);
  }
}

class FakeLlmRouter {
  public calls: any[] = [];

  constructor(private readonly output: any) {}

  async generateJson<T>(input: any): Promise<T> {
    this.calls.push(input);
    return this.output as T;
  }
}

test("memory optimizer skips tasks still inside cooldown window", async () => {
  const repository = new FakeRepository();
  repository.task = {
    id: 42,
    title: "Follow up on invoice",
    status: "IN_PROGRESS",
    last_optimized_at: new Date(Date.now() - 10 * 60 * 1000).toISOString()
  };

  const llmRouter = new FakeLlmRouter({});
  const service = new MemoryOptimizerService(repository as any, llmRouter as any, {
    cooldownMinutes: 30
  });

  const result = await service.runForTask(42);

  assert.equal(result.taskId, 42);
  assert.equal(result.skipped, true);
  assert.match(result.skipReason ?? "", /Cooldown active/);
  assert.equal(llmRouter.calls.length, 0);
  assert.equal(repository.addedEvents.length, 0);
});

test("memory optimizer distills events into summary, facts, and memory index entries", async () => {
  const repository = new FakeRepository();
  repository.task = {
    id: 42,
    title: "Follow up on invoice",
    status: "IN_PROGRESS",
    requested_by: "60111111111",
    target_number: "60122222222",
    charter: { originalIntent: "Get invoice confirmation" },
    snapshot: { currentSummary: "Waiting on confirmation" },
    created_at: "2026-04-08T00:00:00.000Z",
    last_optimized_at: null
  };
  repository.events = Array.from({ length: 10 }, (_, index) => ({
    id: index + 1,
    event_type: index === 0 ? "TASK_CREATED" : "ACTION_TAKEN",
    content: { step: index + 1 },
    created_at: new Date(`2026-04-08T00:${String(index).padStart(2, "0")}:00.000Z`).toISOString()
  }));

  const llmRouter = new FakeLlmRouter({
    taskSummary: "Asked for invoice confirmation and captured the current waiting state.",
    nextStep: "Check whether the client replied.",
    waitingFor: "Client confirmation",
    blocker: null,
    tier1Facts: [
      {
        factKey: "60122222222:preferred_language",
        subject: "60122222222",
        predicate: "preferred_language",
        value: "English",
        confidence: 0.91
      }
    ],
    memoryIndexEntries: [
      {
        memoryKey: "task_42_outcome",
        memoryType: "task_outcome",
        title: "Invoice follow-up in progress",
        summary: "The agent requested invoice confirmation and is now waiting for the client.",
        tags: ["invoice", "follow_up"],
        entities: ["60122222222"],
        importanceScore: 0.77
      }
    ]
  });

  const service = new MemoryOptimizerService(repository as any, llmRouter as any, {
    minEventThreshold: 10
  });

  const result = await service.runForTask(42);

  assert.equal(result.skipped, false);
  assert.equal(result.summaryEventId, 999);
  assert.equal(result.archivedEventCount, 7);
  assert.equal(result.tier1FactsWritten, 1);
  assert.equal(result.memoryIndexEntriesWritten, 1);

  assert.equal(repository.addedEvents.length, 1);
  assert.equal(repository.addedEvents[0].eventType, "TASK_SUMMARY");
  assert.equal(repository.archivedCalls.length, 1);
  assert.equal(repository.archivedCalls[0].checkpointEventId, 999);
  assert.equal(repository.snapshotUpdates.length, 1);
  assert.equal(repository.factWrites[0].memoryTier, 1);
  assert.equal(repository.memoryIndexWrites[0].scopeType, "contact");
  assert.deepEqual(repository.optimizationMetaTaskIds, [42]);
  assert.equal(llmRouter.calls.length, 1);
  assert.equal(llmRouter.calls[0].traceMetadata.sourceTaskId, "42");
});
