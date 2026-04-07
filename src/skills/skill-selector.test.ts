import test from "node:test";
import assert from "node:assert/strict";
import { SkillSelector } from "./skill-selector.js";
import { ActiveSkillPack } from "./types.js";

class FakeSkillRegistry {
  constructor(private readonly activeSkills: ActiveSkillPack[]) {}

  async listActiveSkillPacks(): Promise<ActiveSkillPack[]> {
    return this.activeSkills;
  }
}

function createSkill(input: Partial<ActiveSkillPack> & Pick<ActiveSkillPack, "skillId" | "name" | "description">): ActiveSkillPack {
  return {
    skillId: input.skillId,
    manifestName: input.manifestName ?? input.skillId,
    version: input.version ?? 1,
    versionHash: input.versionHash ?? `${input.skillId}-hash`,
    instructions: input.instructions ?? `${input.name} instructions`,
    name: input.name,
    description: input.description,
    tags: input.tags ?? [],
    domains: input.domains ?? [],
    triggers: input.triggers ?? [],
    allowedTools: input.allowedTools ?? [],
    priority: input.priority ?? 0,
    always: input.always ?? false,
    requires: input.requires ?? { bins: [], env: [] },
    status: input.status ?? "draft",
    sourceFiles: input.sourceFiles ?? [],
    metadata: input.metadata ?? {}
  };
}

test("skill selector ranks relevant inbound skills and records why they matched", async () => {
  const selector = new SkillSelector(
    new FakeSkillRegistry([
      createSkill({
        skillId: "sales-followup",
        name: "Sales Follow-up",
        description: "Helps with sales-report follow-up planning.",
        tags: ["sales", "report"],
        domains: ["sales"],
        triggers: ["daily sales report"],
        allowedTools: ["create_task", "schedule_wakeup"],
        priority: 2
      }),
      createSkill({
        skillId: "hr-leave",
        name: "HR Leave",
        description: "Handles leave-request conversations.",
        tags: ["leave"],
        domains: ["hr"],
        triggers: ["leave request"],
        allowedTools: ["create_task"],
        priority: 1
      })
    ]) as any
  );

  const result = await selector.selectForInbound({
    normalizedText: "Please remind the sales manager tomorrow about the daily sales report for Seremban branch.",
    senderProfile: {
      name: "Seremban Manager",
      domains: ["sales"]
    },
    recentContext: {
      recentMessages: [
        {
          text_content: "Need the daily sales report follow-up"
        }
      ]
    }
  });

  assert.equal(result.selectedSkills.length, 1);
  assert.equal(result.selectedSkills[0]?.skillId, "sales-followup");
  assert.equal(result.selectedSkills[0]?.injectionMode, "full");
  assert.match(result.selectedSkills[0]?.instructions ?? "", /instructions/i);

  const selectedEntry = result.consideredSkills.find((entry) => entry.skillId === "sales-followup");
  assert.ok(selectedEntry?.selected);
  assert.equal(selectedEntry?.available, true);
  assert.ok((selectedEntry?.reasons ?? []).some((reason) => reason.startsWith("trigger:")));
  assert.ok((selectedEntry?.reasons ?? []).some((reason) => reason.startsWith("domain:")));

  const rejectedEntry = result.consideredSkills.find((entry) => entry.skillId === "hr-leave");
  assert.equal(rejectedEntry?.selected, false);
});

test("skill selector keeps unrelated active skills out of planner context", async () => {
  const selector = new SkillSelector(
    new FakeSkillRegistry([
      createSkill({
        skillId: "inventory-audit",
        name: "Inventory Audit",
        description: "Handles stock-check tasks.",
        tags: ["inventory"],
        domains: ["warehouse"],
        triggers: ["stock variance"]
      })
    ]) as any
  );

  const result = await selector.selectForInbound({
    normalizedText: "Thanks, noted.",
    senderProfile: {
      name: "Tester",
      domains: ["general"]
    },
    recentContext: {
      recentMessages: []
    }
  });

  assert.deepEqual(result.selectedSkills, []);
  assert.equal(result.consideredSkills.length, 1);
  assert.equal(result.consideredSkills[0]?.selected, false);
  assert.equal(result.consideredSkills[0]?.available, true);
  assert.equal(result.consideredSkills[0]?.score, 0);
});

test("skill selector can use task context during scheduled wakeups", async () => {
  const selector = new SkillSelector(
    new FakeSkillRegistry([
      createSkill({
        skillId: "sales-followup",
        name: "Sales Follow-up",
        description: "Helps with branch follow-up planning.",
        tags: ["followup"],
        domains: ["sales"],
        triggers: ["daily sales report"],
        priority: 1
      }),
      createSkill({
        skillId: "ops-maintenance",
        name: "Ops Maintenance",
        description: "Handles maintenance schedules.",
        tags: ["maintenance"],
        domains: ["operations"],
        triggers: ["site inspection"]
      })
    ]) as any
  );

  const result = await selector.selectForWakeup({
    wakeupReason: "Daily sales report reminder is due now",
    task: {
      title: "Follow up on daily sales report",
      details: "Check whether Seremban branch sent the report"
    },
    taskEvents: [
      {
        content: {
          note: "sales report still pending"
        }
      }
    ]
  });

  assert.equal(result.selectedSkills.length, 1);
  assert.equal(result.selectedSkills[0]?.skillId, "sales-followup");
});

test("skill selector injects always skills in compact mode even without a text match", async () => {
  const selector = new SkillSelector(
    new FakeSkillRegistry([
      createSkill({
        skillId: "ops-baseline",
        name: "Ops Baseline",
        description: "Applies the default operations planning posture.",
        always: true,
        allowedTools: ["create_task"]
      })
    ]) as any
  );

  const result = await selector.selectForInbound({
    normalizedText: "Hello there",
    senderProfile: {
      name: "Tester",
      domains: []
    },
    recentContext: {
      recentMessages: []
    }
  });

  assert.equal(result.selectedSkills.length, 1);
  assert.equal(result.selectedSkills[0]?.skillId, "ops-baseline");
  assert.equal(result.selectedSkills[0]?.injectionMode, "compact");
  assert.equal(result.selectedSkills[0]?.instructions, null);

  const considered = result.consideredSkills[0];
  assert.equal(considered?.selected, true);
  assert.equal(considered?.available, true);
  assert.ok((considered?.reasons ?? []).includes("always"));
});

test("skill selector skips unavailable skills and records missing requirements", async () => {
  const selector = new SkillSelector(
    new FakeSkillRegistry([
      createSkill({
        skillId: "needs-secret",
        name: "Needs Secret",
        description: "Requires a missing environment variable.",
        requires: {
          bins: [],
          env: ["TOTALLY_MISSING_SKILL_ENV"]
        }
      })
    ]) as any
  );

  const result = await selector.selectForInbound({
    normalizedText: "Use the protected workflow",
    senderProfile: {
      name: "Tester",
      domains: []
    },
    recentContext: {
      recentMessages: []
    }
  });

  assert.deepEqual(result.selectedSkills, []);
  assert.equal(result.consideredSkills.length, 1);
  assert.equal(result.consideredSkills[0]?.selected, false);
  assert.equal(result.consideredSkills[0]?.available, false);
  assert.ok((result.consideredSkills[0]?.reasons ?? []).includes("missing_env:TOTALLY_MISSING_SKILL_ENV"));
});
