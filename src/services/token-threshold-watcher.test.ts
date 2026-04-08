import test from "node:test";
import assert from "node:assert/strict";
import { TokenThresholdWatcher } from "./token-threshold-watcher.js";

class FakeRepository {
  public breachingTaskIds: number[] = [];
  public calls: any[] = [];

  async findThresholdBreachingTaskIds(input: any): Promise<number[]> {
    this.calls.push(input);
    return this.breachingTaskIds;
  }
}

class FakeOptimizer {
  public calls: number[] = [];
  public results = new Map<number, any>();

  async runForTask(taskId: number): Promise<any> {
    this.calls.push(taskId);
    return this.results.get(taskId) ?? { taskId, skipped: true, skipReason: "No result configured." };
  }
}

class FakeDebugService {
  public logs: any[] = [];

  createRunId(prefix: string): string {
    return `${prefix}-run`;
  }

  async log(input: any): Promise<void> {
    this.logs.push(input);
  }
}

test("token threshold watcher polls for breaching tasks and runs the optimizer", async () => {
  const repository = new FakeRepository();
  repository.breachingTaskIds = [11, 22];

  const optimizer = new FakeOptimizer();
  optimizer.results.set(11, {
    taskId: 11,
    skipped: false,
    archivedEventCount: 5,
    tier1FactsWritten: 1,
    memoryIndexEntriesWritten: 1
  });
  optimizer.results.set(22, {
    taskId: 22,
    skipped: true,
    skipReason: "Cooldown active."
  });

  const debugService = new FakeDebugService();
  const watcher = new TokenThresholdWatcher(repository as any, optimizer as any, debugService as any, {
    tokenThreshold: 15000,
    lookbackMinutes: 90
  });

  await watcher.poll();

  assert.equal(repository.calls.length, 1);
  assert.equal(repository.calls[0].tokenThreshold, 15000);
  assert.equal(repository.calls[0].lookbackMinutes, 90);
  assert.deepEqual(optimizer.calls, [11, 22]);
  assert.ok(debugService.logs.some((log) => String(log.summary).includes("Found 2 task(s) exceeding threshold")));
  assert.ok(debugService.logs.some((log) => String(log.summary).includes("Optimizer succeeded for task 11")));
  assert.ok(debugService.logs.some((log) => String(log.summary).includes("Optimizer skipped task 22")));
});

test("token threshold watcher skips overlapping poll cycles", async () => {
  let releasePoll: (() => void) | null = null;

  const repository = {
    calls: 0,
    async findThresholdBreachingTaskIds(): Promise<number[]> {
      this.calls += 1;
      await new Promise<void>((resolve) => {
        releasePoll = resolve;
      });
      return [33];
    }
  };

  const optimizer = new FakeOptimizer();
  optimizer.results.set(33, {
    taskId: 33,
    skipped: false,
    archivedEventCount: 2,
    tier1FactsWritten: 0,
    memoryIndexEntriesWritten: 0
  });

  const debugService = new FakeDebugService();
  const watcher = new TokenThresholdWatcher(repository as any, optimizer as any, debugService as any, {
    tokenThreshold: 15000
  });

  const firstPoll = watcher.poll();
  const secondPoll = watcher.poll();

  await Promise.resolve();
  assert.equal(repository.calls, 1);

  releasePoll?.();
  await Promise.all([firstPoll, secondPoll]);

  assert.deepEqual(optimizer.calls, [33]);
});
