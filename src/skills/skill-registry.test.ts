import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppConfig } from "../config.js";
import { SkillRegistry } from "./skill-registry.js";

class FakeSkillRepository {
  private readonly versions = new Map<string, any[]>();

  async saveSkillVersion(input: {
    skillId: string;
    manifestName: string;
    content: string;
    versionHash: string;
    sourceFiles: string[];
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    const existing = (this.versions.get(input.skillId) ?? []).find((row) => row.version_hash === input.versionHash);
    if (existing) {
      return existing;
    }

    const rows = this.versions.get(input.skillId) ?? [];
    const row = {
      id: rows.length + 1,
      skill_id: input.skillId,
      version: rows.length + 1,
      content: input.content,
      is_active: false,
      manifest_name: input.manifestName,
      version_hash: input.versionHash,
      source_files: input.sourceFiles,
      metadata: input.metadata ?? {}
    };

    rows.push(row);
    this.versions.set(input.skillId, rows);
    return row;
  }

  async getActiveSkillVersion(skillId: string): Promise<any | null> {
    return (this.versions.get(skillId) ?? []).find((row) => row.is_active) ?? null;
  }

  async listActiveSkillVersions(): Promise<any[]> {
    return Array.from(this.versions.values())
      .flat()
      .filter((row) => row.is_active)
      .sort((left, right) => left.skill_id.localeCompare(right.skill_id));
  }

  async activateSkillVersion(input: {
    skillId: string;
    versionHash?: string;
    version?: number;
  }): Promise<any | null> {
    const rows = this.versions.get(input.skillId) ?? [];
    const target =
      rows.find((row) => (input.versionHash ? row.version_hash === input.versionHash : row.version === input.version)) ?? null;

    if (!target) {
      return null;
    }

    for (const row of rows) {
      row.is_active = false;
    }

    target.is_active = true;
    return target;
  }
}

function createConfig(skillsDir: string): AppConfig {
  return {
    port: 3000,
    databaseUrl: "postgres://unused",
    databaseSchema: "ai_employee",
    companyReadDatabaseUrl: undefined,
    openAiApiKey: undefined,
    uniApiApiKey: undefined,
    uniApiGeminiBaseUrl: "https://example.com/gemini",
    uniApiOpenAiBaseUrl: "https://example.com/openai",
    llmRouterProvider: "uniapi-gemini",
    llmRouterModel: "gemini-3.1-flash-lite-preview",
    openAiReasoningModel: "gpt-5.4-mini",
    openAiVisionModel: "gpt-5.4-mini",
    openAiTranscribeModel: "gpt-4o-transcribe",
    healthcheckModel: "gpt-5.4-mini",
    whatsappAuthDir: path.resolve(process.cwd(), "data/baileys-auth"),
    mediaStorageDir: path.resolve(process.cwd(), "data/media"),
    promptsDir: path.resolve(process.cwd(), "prompts"),
    skillsDir,
    adminApiToken: undefined,
    bootstrapWhatsappNumber: undefined,
    botName: "AI Employee",
    autonomyMode: "low-risk",
    testerWhatsappNumbers: [],
    sdmoTokenThreshold: 15000,
    sdmoOptimizerCooldownMinutes: 30,
    sdmoContextBudgetTokens: 20000
  };

}

async function writeSkillPackage(root: string, folderName: string, manifest: Record<string, unknown>, instructions?: string) {
  const packageDir = path.join(root, folderName);
  await fs.mkdir(packageDir, { recursive: true });
  await fs.writeFile(path.join(packageDir, "skill.json"), JSON.stringify(manifest, null, 2));
  if (instructions !== undefined) {
    await fs.writeFile(path.join(packageDir, "SKILL.md"), instructions);
  }
}

test("skill registry reloads packages but keeps them inactive until explicitly activated", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-registry-"));
  const skillsDir = path.join(tempRoot, "skills");
  await writeSkillPackage(
    skillsDir,
    "sales-followup",
    {
      skillId: "sales-followup",
      name: "Sales Follow-up",
      description: "Helps the planner create concise sales follow-up tasks.",
      tags: ["sales", "followup"],
      domains: ["sales"],
      triggers: ["daily sales report"],
      allowedTools: ["create_task", "schedule_wakeup"],
      priority: 2,
      always: true,
      requires: {
        bins: ["node"],
        env: ["OPENAI_API_KEY"]
      },
      status: "draft"
    },
    "Use this skill when the user mentions branch sales reporting or a follow-up reminder."
  );

  const repository = new FakeSkillRepository();
  const registry = new SkillRegistry(createConfig(skillsDir), repository as any);

  const synced = await registry.reload();
  assert.equal(synced.length, 1);
  assert.equal(synced[0]?.skillId, "sales-followup");
  assert.equal((await registry.listActiveSkillPacks()).length, 0);

  const activated = await registry.activateSkillVersion({
    skillId: "sales-followup",
    versionHash: synced[0]?.versionHash
  });

  assert.ok(activated);

  const activePack = await registry.getActiveSkillPack("sales-followup");
  assert.ok(activePack);
  assert.equal(activePack?.name, "Sales Follow-up");
  assert.equal(activePack?.status, "draft");
  assert.equal(activePack?.always, true);
  assert.deepEqual(activePack?.allowedTools, ["create_task", "schedule_wakeup"]);
  assert.deepEqual(activePack?.requires, {
    bins: ["node"],
    env: ["OPENAI_API_KEY"]
  });
  assert.match(activePack?.instructions ?? "", /branch sales reporting/i);
});

test("skill registry rejects duplicate skill ids across packages", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-registry-"));
  const skillsDir = path.join(tempRoot, "skills");

  await writeSkillPackage(
    skillsDir,
    "first-package",
    {
      skillId: "shared-skill",
      name: "Shared Skill A",
      description: "First package",
      status: "draft"
    },
    "A"
  );
  await writeSkillPackage(
    skillsDir,
    "second-package",
    {
      skillId: "shared-skill",
      name: "Shared Skill B",
      description: "Second package",
      status: "draft"
    },
    "B"
  );

  const registry = new SkillRegistry(createConfig(skillsDir), new FakeSkillRepository() as any);
  await assert.rejects(
    () => registry.reload(),
    /Duplicate skillId "shared-skill" found in skill packages: first-package and second-package/
  );
});

test("skill registry reports missing SKILL.md files with package context", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-registry-"));
  const skillsDir = path.join(tempRoot, "skills");

  await writeSkillPackage(skillsDir, "missing-body", {
    skillId: "missing-body",
    name: "Missing Body",
    description: "Should fail clearly",
    status: "draft"
  });

  const registry = new SkillRegistry(createConfig(skillsDir), new FakeSkillRepository() as any);
  await assert.rejects(
    () => registry.reload(),
    /Skill package missing-body references missing file SKILL\.md/
  );
});
