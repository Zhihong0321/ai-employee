import test from "node:test";
import assert from "node:assert/strict";
import { resolveInboundGateResult } from "./inbound-message-gate.js";
import { IntakeDecision } from "../../types.js";

function buildDecision(overrides: Partial<IntakeDecision> = {}): IntakeDecision {
  return {
    disposition: "dispatch",
    category: "UNKNOWN",
    reason: "potentially_actionable",
    normalizedText: "hello",
    confidence: 0.9,
    ...overrides
  };
}

test("gate resolves store-only intake decisions to history-only", () => {
  const result = resolveInboundGateResult(
    buildDecision({
      disposition: "store_only",
      category: "NOISE",
      reason: "reaction_message"
    })
  );

  assert.equal(result.action, "history_only");
  assert.equal(result.intent, "history_only");
  assert.equal(result.category, "NOISE");
  assert.equal(result.reason, "reaction_message");
});

test("gate resolves task actions to planner-required", () => {
  const result = resolveInboundGateResult(
    buildDecision({
      category: "TASK_ACTION"
    })
  );

  assert.equal(result.action, "planner_required");
  assert.equal(result.intent, "task_create_or_update");
  assert.equal(result.reason, "task_action_requires_planner");
  assert.equal(result.plannerRequirementReason, "task_runtime_flow_not_ready");
});

test("gate resolves knowledge queries to planner-required", () => {
  const result = resolveInboundGateResult(
    buildDecision({
      category: "KNOWLEDGE_QUERY"
    })
  );

  assert.equal(result.action, "planner_required");
  assert.equal(result.intent, "reply_only");
  assert.equal(result.reason, "knowledge_query_requires_planner");
  assert.equal(result.plannerRequirementReason, "reply_only_runtime_not_safe");
});

test("gate keeps unknown actionable inbound on the planner-required path", () => {
  const result = resolveInboundGateResult(buildDecision());

  assert.equal(result.action, "planner_required");
  assert.equal(result.intent, "planner_review");
  assert.equal(result.reason, "actionable_unknown_requires_planner");
  assert.equal(result.plannerRequirementReason, "unknown_actionable_requires_planner_review");
});

test("gate gives clarification cues an explicit clarification review intent", () => {
  const result = resolveInboundGateResult(
    buildDecision({
      category: "UNKNOWN",
      reason: "clarification_cue_detected"
    })
  );

  assert.equal(result.action, "planner_required");
  assert.equal(result.intent, "clarification_review");
  assert.equal(result.reason, "clarification_cue_requires_planner_review");
  assert.equal(result.plannerRequirementReason, "clarification_resolution_requires_planner");
});

test("gate gives fact update cues an explicit fact update review intent", () => {
  const result = resolveInboundGateResult(
    buildDecision({
      category: "UNKNOWN",
      reason: "fact_update_cue_detected"
    })
  );

  assert.equal(result.action, "planner_required");
  assert.equal(result.intent, "fact_update_review");
  assert.equal(result.reason, "fact_update_cue_requires_planner_review");
  assert.equal(result.plannerRequirementReason, "fact_update_requires_memory_review");
});

test("gate gives instruction policy cues an explicit instruction review intent", () => {
  const result = resolveInboundGateResult(
    buildDecision({
      category: "UNKNOWN",
      reason: "instruction_policy_cue_detected"
    })
  );

  assert.equal(result.action, "planner_required");
  assert.equal(result.intent, "instruction_review");
  assert.equal(result.reason, "instruction_policy_cue_requires_planner_review");
  assert.equal(result.plannerRequirementReason, "instruction_policy_requires_review");
});
