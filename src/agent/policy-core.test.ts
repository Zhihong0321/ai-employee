import { describe, expect, test } from "vitest";
import { AgentPolicyEngine } from "./policy-core.js";

class FakeRepository {
  async canAutonomouslyReachContact(targetNumber: string): Promise<boolean> {
    return targetNumber === "60111111111";
  }

  async getTaskById(taskId: number): Promise<any | null> {
    if (taskId === 99) {
      return {
        id: 99,
        status: "TODO"
      };
    }

    return null;
  }
}

describe("policy core", () => {
  test("normalizes task status updates", async () => {
    const engine = new AgentPolicyEngine(new FakeRepository() as any);
    const result = await engine.validateToolAction({
      toolName: "update_task_status",
      args: {
        task_id: 99,
        status: "in_progress",
        event_note: "Started work."
      }
    });

    expect(result.outcome).toBe("allow");
    expect(result.normalizedArgs.status).toBe("IN_PROGRESS");
  });

  test("requires handoff when outreach permission is missing", async () => {
    const engine = new AgentPolicyEngine(new FakeRepository() as any);
    const result = await engine.validateToolAction({
      toolName: "send_whatsapp_message",
      args: {
        target_number: "60122222222",
        message: "Please send the report."
      }
    });

    expect(result.outcome).toBe("handoff_required");
    expect(result.reason).toBe("autonomous_outreach_not_allowed");
  });
});
