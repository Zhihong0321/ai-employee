import test from "node:test";
import assert from "node:assert/strict";
import { assembleInboundContext, assembleWakeupContext } from "./context-budget.js";

test("context budget trims lower-priority inbound layers when the budget is tight", () => {
  const payload = assembleInboundContext(
    {
      senderProfile: {
        whatsapp_number: "60123456789",
        name: "Sam",
        role: "Ops",
        notes: "x".repeat(400)
      },
      recentContext: {
        recentMessages: Array.from({ length: 8 }, (_, index) => ({
          direction: "inbound",
          kind: "text",
          text_content: `Message ${index} ${"y".repeat(120)}`,
          occurred_at: `2026-04-08T00:0${index}:00.000Z`
        })),
        contacts: Array.from({ length: 3 }, (_, index) => ({
          whatsapp_number: `60123${index}`,
          name: `Contact ${index}`,
          role: "Staff"
        })),
        facts: Array.from({ length: 10 }, (_, index) => ({
          fact_key: `fact:${index}`,
          subject: "policy",
          predicate: `rule_${index}`,
          value: "z".repeat(100)
        }))
      },
      activeTasks: Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        title: `Task ${index + 1}`,
        status: "IN_PROGRESS",
        snapshot: {
          currentSummary: "w".repeat(200)
        }
      })),
      memoryEvidence: {
        scopeType: "contact",
        scopeId: "60123456789",
        relevantMemories: Array.from({ length: 6 }, (_, index) => ({
          memoryKey: `memory:${index}`,
          memoryType: "event_summary",
          title: `Memory ${index}`,
          summary: "q".repeat(220)
        }))
      }
    },
    350
  );

  assert.ok(payload.budgetMeta.trimmedLayers.length > 0);
  assert.ok(payload.recentContext.recentMessages.length <= 4);
  assert.ok(payload.activeTasks.length <= 2);
  assert.ok(payload.memoryEvidence.relevantMemories.length <= 3);
});

test("context budget keeps TASK_SUMMARY while trimming wakeup timelines", () => {
  const payload = assembleWakeupContext(
    {
      task: {
        id: 55,
        title: "Follow up",
        status: "IN_PROGRESS",
        details: "Check status"
      },
      taskEvents: [
        {
          id: 100,
          event_type: "TASK_SUMMARY",
          content: { summary: "Condensed history" },
          created_at: "2026-04-08T00:00:00.000Z"
        },
        ...Array.from({ length: 12 }, (_, index) => ({
          id: index + 1,
          event_type: "ACTION_TAKEN",
          content: { note: "r".repeat(180) },
          created_at: `2026-04-08T00:${String(index + 1).padStart(2, "0")}:00.000Z`
        }))
      ],
      memoryEvidence: {
        scopeType: "task",
        scopeId: "55",
        relevantMemories: Array.from({ length: 5 }, (_, index) => ({
          memoryKey: `memory:${index}`,
          memoryType: "event_summary",
          title: `Memory ${index}`,
          summary: "m".repeat(160)
        }))
      }
    },
    320
  );

  assert.ok(payload.budgetMeta.trimmedLayers.includes("recentTimeline"));
  assert.equal(payload.recentTimeline[0]?.event_type, "TASK_SUMMARY");
  assert.ok(payload.recentTimeline.length <= 5);
});
