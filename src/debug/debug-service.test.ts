import test from "node:test";
import assert from "node:assert/strict";
import { DebugService, formatDebugStageLabel } from "./debug-service.js";
import { DebugConfig } from "./types.js";

class FakeDebugRepository {
  public config: DebugConfig = {
    mode: "debug_off",
    promptTrace: false,
    apiPayloadTrace: false,
    enabledTaskIds: [],
    enabledToolNames: []
  };

  public records: any[] = [];

  async getDebugConfig(): Promise<DebugConfig> {
    return this.config;
  }

  async saveDebugConfig(config: DebugConfig): Promise<void> {
    this.config = config;
  }

  async addDebugRecord(input: any): Promise<void> {
    this.records.push(input);
  }
}

test("debug service respects mode thresholds and redacts traced payload fields", async () => {
  const repository = new FakeDebugRepository();
  const service = new DebugService(repository as any);

  await service.log({
    stage: "planning",
    summary: "should skip while debug is off",
    payload: { prompt: "secret", apiPayload: { x: 1 } }
  });
  assert.equal(repository.records.length, 0);

  await service.updateConfig({
    mode: "debug_verbose",
    promptTrace: false,
    apiPayloadTrace: false,
    enabledTaskIds: [],
    enabledToolNames: []
  });

  await service.log({
    stage: "planning",
    summary: "should persist after enabling verbose mode",
    payload: {
      prompt: "secret",
      apiPayload: { x: 1 },
      safeValue: true
    }
  });

  assert.equal(repository.records.length, 1);
  assert.equal(repository.records[0].payload.safeValue, true);
  assert.equal("prompt" in repository.records[0].payload, false);
  assert.equal("apiPayload" in repository.records[0].payload, false);
});

test("debug service honors task and tool overrides even when mode is off", async () => {
  const repository = new FakeDebugRepository();
  const service = new DebugService(repository as any);

  await service.updateConfig({
    mode: "debug_off",
    promptTrace: false,
    apiPayloadTrace: false,
    enabledTaskIds: [42],
    enabledToolNames: ["web_search"]
  });

  const config = await service.getConfig(true);

  assert.equal(service.shouldLog({ taskId: 42 }, config), true);
  assert.equal(service.shouldLog({ toolName: "web_search" }, config), true);
  assert.equal(service.shouldLog({ taskId: 7, toolName: "other_tool" }, config), false);
});

test("debug stage labels remain human readable", () => {
  assert.equal(formatDebugStageLabel("context_load"), "context load");
  assert.equal(formatDebugStageLabel("policy_validation"), "policy validation");
  assert.equal(formatDebugStageLabel("tool_call"), "tool call");
});
