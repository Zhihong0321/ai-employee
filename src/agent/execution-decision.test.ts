import { describe, expect, test } from "vitest";
import { normalizeExecutionDecision } from "./execution-decision.js";

describe("execution decision normalization", () => {
  test("keeps backward compatibility with thought and actions only", () => {
    const decision = normalizeExecutionDecision({
      thought: "Send a follow-up and update the task.",
      actions: [
        {
          tool: "send_whatsapp_message",
          args: { target_number: "60111111111", message: "Checking in." }
        }
      ]
    });

    expect(decision.reasoningSummary).toContain("Send a follow-up");
    expect(decision.actions).toHaveLength(1);
    expect(decision.classification).toBe("task_progression");
  });

  test("prefers explicit structured fields when present", () => {
    const decision = normalizeExecutionDecision({
      classification: "scheduled_wakeup",
      goal: "Check whether the report was sent.",
      riskLevel: "medium",
      taskStatus: "WAITING",
      actions: []
    });

    expect(decision.classification).toBe("scheduled_wakeup");
    expect(decision.goal).toBe("Check whether the report was sent.");
    expect(decision.riskLevel).toBe("medium");
    expect(decision.taskStatus).toBe("WAITING");
  });
});
