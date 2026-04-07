import test from "node:test";
import assert from "node:assert/strict";
import { resolveInboundClassificationPath } from "./inbound-classification-path.js";
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

test("classification path keeps store-only decisions deterministic", () => {
  const result = resolveInboundClassificationPath(
    buildDecision({
      disposition: "store_only",
      category: "NOISE",
      reason: "reaction_message"
    })
  );

  assert.equal(result.path, "deterministic_history_only");
});

test("classification path escalates unknown actionable messages to llm classification", () => {
  const result = resolveInboundClassificationPath(buildDecision());

  assert.equal(result.path, "llm_classification_required");
});

test("classification path preserves deterministic actionable categories", () => {
  const result = resolveInboundClassificationPath(
    buildDecision({
      category: "TASK_ACTION"
    })
  );

  assert.equal(result.path, "deterministic_actionable");
});

test("classification path keeps clarification cues deterministic without classifier escalation", () => {
  const result = resolveInboundClassificationPath(
    buildDecision({
      category: "UNKNOWN",
      reason: "clarification_cue_detected"
    })
  );

  assert.equal(result.path, "deterministic_actionable");
});

test("classification path keeps fact update cues deterministic without classifier escalation", () => {
  const result = resolveInboundClassificationPath(
    buildDecision({
      category: "UNKNOWN",
      reason: "fact_update_cue_detected"
    })
  );

  assert.equal(result.path, "deterministic_actionable");
});

test("classification path keeps instruction policy cues deterministic without classifier escalation", () => {
  const result = resolveInboundClassificationPath(
    buildDecision({
      category: "UNKNOWN",
      reason: "instruction_policy_cue_detected"
    })
  );

  assert.equal(result.path, "deterministic_actionable");
});
