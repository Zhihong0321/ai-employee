import test from "node:test";
import assert from "node:assert/strict";
import { resolveInboundGateDispatchResult } from "./inbound-gate-dispatch.js";
import { InboundGateResult } from "./inbound-message-gate.js";

function buildGateResult(overrides: Partial<InboundGateResult> = {}): InboundGateResult {
  return {
    action: "planner_required",
    intent: "task_create_or_update",
    category: "TASK_ACTION",
    disposition: "dispatch",
    reason: "task_action_requires_planner",
    plannerRequirementReason: "task_runtime_flow_not_ready",
    normalizedText: "Please do this",
    confidence: 0.9,
    ...overrides
  };
}

test("dispatch result keeps history-only paths local", () => {
  const result = resolveInboundGateDispatchResult(
    buildGateResult({
      action: "history_only",
      category: "NOISE",
      disposition: "store_only",
      reason: "reaction_message"
    }),
    { hasDownstreamHandler: true }
  );

  assert.equal(result.action, "history_only");
  assert.equal(result.runtimeSupport, "supported");
  assert.equal(result.decisionType, "message_gate_history_only");
});

test("dispatch result exposes planner-unavailable when no downstream handler exists", () => {
  const result = resolveInboundGateDispatchResult(buildGateResult(), {
    hasDownstreamHandler: false
  });

  assert.equal(result.action, "planner_unavailable");
  assert.equal(result.runtimeSupport, "fallback_to_planner");
  assert.equal(result.runtimeFallbackReason, "task_runtime_flow_not_ready");
  assert.equal(result.decisionType, "message_gate_planner_unavailable");
});

test("dispatch result exposes planner handoff when downstream handler exists", () => {
  const result = resolveInboundGateDispatchResult(buildGateResult(), {
    hasDownstreamHandler: true
  });

  assert.equal(result.action, "planner_handoff");
  assert.equal(result.runtimeSupport, "fallback_to_planner");
  assert.equal(result.runtimeFallbackReason, "task_runtime_flow_not_ready");
  assert.equal(result.decisionType, "message_gate_planner_handoff");
});

test("dispatch result makes reply-only fallback explicit while deterministic replies remain unsupported", () => {
  const result = resolveInboundGateDispatchResult(
    buildGateResult({
      intent: "reply_only",
      category: "KNOWLEDGE_QUERY",
      reason: "knowledge_query_requires_planner",
      plannerRequirementReason: "reply_only_runtime_not_safe"
    }),
    {
      hasDownstreamHandler: true
    }
  );

  assert.equal(result.action, "planner_handoff");
  assert.equal(result.runtimeFallbackReason, "reply_only_runtime_not_safe");
  assert.match(result.summary, /Reply-only candidate fell back to planner/);
});

test("dispatch result makes clarification review explicit in planner handoff summaries", () => {
  const result = resolveInboundGateDispatchResult(
    buildGateResult({
      intent: "clarification_review",
      category: "UNKNOWN",
      reason: "clarification_cue_requires_planner_review",
      plannerRequirementReason: "clarification_resolution_requires_planner"
    }),
    {
      hasDownstreamHandler: true
    }
  );

  assert.equal(result.action, "planner_handoff");
  assert.equal(result.runtimeFallbackReason, "clarification_resolution_requires_planner");
  assert.match(result.summary, /Clarification-style inbound message required planner review/);
});

test("dispatch result makes fact update review explicit in planner handoff summaries", () => {
  const result = resolveInboundGateDispatchResult(
    buildGateResult({
      intent: "fact_update_review",
      category: "UNKNOWN",
      reason: "fact_update_cue_requires_planner_review",
      plannerRequirementReason: "fact_update_requires_memory_review"
    }),
    {
      hasDownstreamHandler: true
    }
  );

  assert.equal(result.action, "planner_handoff");
  assert.equal(result.runtimeFallbackReason, "fact_update_requires_memory_review");
  assert.match(result.summary, /Fact-update-style inbound message required planner review/);
});

test("dispatch result makes instruction review explicit in planner handoff summaries", () => {
  const result = resolveInboundGateDispatchResult(
    buildGateResult({
      intent: "instruction_review",
      category: "UNKNOWN",
      reason: "instruction_policy_cue_requires_planner_review",
      plannerRequirementReason: "instruction_policy_requires_review"
    }),
    {
      hasDownstreamHandler: true
    }
  );

  assert.equal(result.action, "planner_handoff");
  assert.equal(result.runtimeFallbackReason, "instruction_policy_requires_review");
  assert.match(result.summary, /Instruction-policy inbound message required planner review/);
});
