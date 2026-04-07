import { InboundGateResult } from "./inbound-message-gate.js";

export type InboundGateDispatchAction = "history_only" | "planner_handoff" | "planner_unavailable";
export type InboundGateRuntimeSupport = "supported" | "fallback_to_planner";

export type InboundGateDispatchResult = {
  action: InboundGateDispatchAction;
  gate: InboundGateResult;
  runtimeSupport: InboundGateRuntimeSupport;
  runtimeFallbackReason?: string;
  decisionType: string;
  summary: string;
};

function getPlannerFallbackReason(gateResult: InboundGateResult): string {
  return gateResult.plannerRequirementReason ?? "planner_required_by_gate";
}

function buildPlannerSummary(
  gateResult: InboundGateResult,
  unavailable: boolean
): string {
  const suffix = unavailable
    ? "but no downstream handler was available"
    : "and was dispatched to the downstream handler";

  switch (gateResult.intent) {
    case "reply_only":
      return `Reply-only candidate fell back to planner because deterministic reply handling is not yet safe, ${suffix}`;
    case "task_create_or_update":
      return `Task-oriented inbound message required planner-backed task evaluation and was ${unavailable ? "not dispatched because no downstream handler was available" : "dispatched to the downstream handler"}`;
    case "instruction_review":
      return `Instruction-policy inbound message required planner review and was ${unavailable ? "not dispatched because no downstream handler was available" : "dispatched to the downstream handler"}`;
    case "fact_update_review":
      return `Fact-update-style inbound message required planner review and was ${unavailable ? "not dispatched because no downstream handler was available" : "dispatched to the downstream handler"}`;
    case "clarification_review":
      return `Clarification-style inbound message required planner review and was ${unavailable ? "not dispatched because no downstream handler was available" : "dispatched to the downstream handler"}`;
    case "planner_review":
    default:
      return `Actionable inbound message required planner review and was ${unavailable ? "not dispatched because no downstream handler was available" : "dispatched to the downstream handler"}`;
  }
}

export function resolveInboundGateDispatchResult(
  gateResult: InboundGateResult,
  options: {
    hasDownstreamHandler: boolean;
  }
): InboundGateDispatchResult {
  if (gateResult.action === "history_only") {
    return {
      action: "history_only",
      gate: gateResult,
      runtimeSupport: "supported",
      decisionType: "message_gate_history_only",
      summary: "Stored inbound message without planner wake-up"
    };
  }

  if (!options.hasDownstreamHandler) {
    return {
      action: "planner_unavailable",
      gate: gateResult,
      runtimeSupport: "fallback_to_planner",
      runtimeFallbackReason: getPlannerFallbackReason(gateResult),
      decisionType: "message_gate_planner_unavailable",
      summary: buildPlannerSummary(gateResult, true)
    };
  }

  return {
    action: "planner_handoff",
    gate: gateResult,
    runtimeSupport: "fallback_to_planner",
    runtimeFallbackReason: getPlannerFallbackReason(gateResult),
    decisionType: "message_gate_planner_handoff",
    summary: buildPlannerSummary(gateResult, false)
  };
}
