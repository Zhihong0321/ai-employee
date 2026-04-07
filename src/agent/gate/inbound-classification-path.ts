import { IntakeDecision } from "../../types.js";

export type InboundClassificationPath =
  | "deterministic_history_only"
  | "deterministic_actionable"
  | "llm_classification_required";

export type InboundClassificationPathResult = {
  path: InboundClassificationPath;
  decision: IntakeDecision;
};

export function resolveInboundClassificationPath(decision: IntakeDecision): InboundClassificationPathResult {
  if (decision.disposition !== "dispatch") {
    return {
      path: "deterministic_history_only",
      decision
    };
  }

  if (decision.reason === "clarification_cue_detected") {
    return {
      path: "deterministic_actionable",
      decision
    };
  }

  if (decision.reason === "fact_update_cue_detected") {
    return {
      path: "deterministic_actionable",
      decision
    };
  }

  if (decision.reason === "instruction_policy_cue_detected") {
    return {
      path: "deterministic_actionable",
      decision
    };
  }

  if (decision.category === "UNKNOWN") {
    return {
      path: "llm_classification_required",
      decision
    };
  }

  return {
    path: "deterministic_actionable",
    decision
  };
}
