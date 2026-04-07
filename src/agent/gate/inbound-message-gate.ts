import { IntakeDecision } from "../../types.js";

export type InboundGateAction = "history_only" | "planner_required";
export type InboundGateIntent =
  | "history_only"
  | "reply_only"
  | "task_create_or_update"
  | "instruction_review"
  | "fact_update_review"
  | "clarification_review"
  | "planner_review";

export type InboundGateResult = {
  action: InboundGateAction;
  intent: InboundGateIntent;
  category: IntakeDecision["category"];
  disposition: IntakeDecision["disposition"];
  reason: string;
  plannerRequirementReason?: string;
  normalizedText: string;
  confidence?: number;
};

export function resolveInboundGateResult(decision: IntakeDecision): InboundGateResult {
  if (decision.disposition !== "dispatch") {
    return {
      action: "history_only",
      intent: "history_only",
      category: decision.category,
      disposition: decision.disposition,
      reason: decision.reason,
      normalizedText: decision.normalizedText,
      confidence: decision.confidence
    };
  }

  switch (decision.category) {
    case "TASK_ACTION":
      return {
        action: "planner_required",
        intent: "task_create_or_update",
        category: decision.category,
        disposition: decision.disposition,
        reason: "task_action_requires_planner",
        plannerRequirementReason: "task_runtime_flow_not_ready",
        normalizedText: decision.normalizedText,
        confidence: decision.confidence
      };
    case "KNOWLEDGE_QUERY":
      return {
        action: "planner_required",
        intent: "reply_only",
        category: decision.category,
        disposition: decision.disposition,
        reason: "knowledge_query_requires_planner",
        plannerRequirementReason: "reply_only_runtime_not_safe",
        normalizedText: decision.normalizedText,
        confidence: decision.confidence
      };
    case "UNKNOWN":
    default:
      if (decision.reason === "instruction_policy_cue_detected") {
        return {
          action: "planner_required",
          intent: "instruction_review",
          category: decision.category,
          disposition: decision.disposition,
          reason: "instruction_policy_cue_requires_planner_review",
          plannerRequirementReason: "instruction_policy_requires_review",
          normalizedText: decision.normalizedText,
          confidence: decision.confidence
        };
      }

      if (decision.reason === "fact_update_cue_detected") {
        return {
          action: "planner_required",
          intent: "fact_update_review",
          category: decision.category,
          disposition: decision.disposition,
          reason: "fact_update_cue_requires_planner_review",
          plannerRequirementReason: "fact_update_requires_memory_review",
          normalizedText: decision.normalizedText,
          confidence: decision.confidence
        };
      }

      if (decision.reason === "clarification_cue_detected") {
        return {
          action: "planner_required",
          intent: "clarification_review",
          category: decision.category,
          disposition: decision.disposition,
          reason: "clarification_cue_requires_planner_review",
          plannerRequirementReason: "clarification_resolution_requires_planner",
          normalizedText: decision.normalizedText,
          confidence: decision.confidence
        };
      }

      return {
        action: "planner_required",
        intent: "planner_review",
        category: decision.category,
        disposition: decision.disposition,
        reason: "actionable_unknown_requires_planner",
        plannerRequirementReason: "unknown_actionable_requires_planner_review",
        normalizedText: decision.normalizedText,
        confidence: decision.confidence
      };
  }
}
