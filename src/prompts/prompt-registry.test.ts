import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PromptRegistry } from "./prompt-registry.js";
import { AppConfig } from "../config.js";

class FakePromptRepository {
  private readonly versions = new Map<string, any[]>();

  async savePromptVersion(input: {
    promptKey: string;
    manifestName: string;
    content: string;
    versionHash: string;
    sourceFiles: string[];
    metadata?: Record<string, unknown>;
  }): Promise<any> {
    const existing = (this.versions.get(input.promptKey) ?? []).find((row) => row.version_hash === input.versionHash);
    if (existing) {
      return existing;
    }

    const rows = this.versions.get(input.promptKey) ?? [];
    const row = {
      id: rows.length + 1,
      prompt_key: input.promptKey,
      version: rows.length + 1,
      content: input.content,
      is_active: false,
      manifest_name: input.manifestName,
      version_hash: input.versionHash,
      source_files: input.sourceFiles,
      metadata: input.metadata ?? {}
    };

    rows.push(row);
    this.versions.set(input.promptKey, rows);
    return row;
  }

  async getActivePromptVersion(promptKey: string): Promise<any | null> {
    return (this.versions.get(promptKey) ?? []).find((row) => row.is_active) ?? null;
  }

  async activatePromptVersion(input: { promptKey: string; versionHash?: string; version?: number }): Promise<any | null> {
    const rows = this.versions.get(input.promptKey) ?? [];
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

function createConfig(): AppConfig {
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
    skillsDir: path.resolve(process.cwd(), "skills"),
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

test("prompt registry reloads manifests and activates first versions", async () => {
  const repository = new FakePromptRepository();
  const registry = new PromptRegistry(createConfig(), repository as any);

  const synced = await registry.reload();
  assert.ok(synced.length >= 4);

  const inboundDecision = await registry.getActivePromptPack("inbound-decision");
  assert.equal(inboundDecision.promptKey, "inbound-decision");
  assert.ok(inboundDecision.systemPrompt.includes("WhatsApp-based AI employee"));
  assert.ok(inboundDecision.schemaDescription?.includes("\"category\""));
  assert.ok(inboundDecision.versionHash.length > 10);

  const agentInboundDecision = await registry.getActivePromptPack("agent-inbound-decision");
  assert.equal(agentInboundDecision.promptKey, "agent-inbound-decision");
  assert.ok(agentInboundDecision.referenceContext?.includes("Agent Memory Map"));
});

test("prompt registry rejects duplicate prompt keys across manifests", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-registry-"));
  const promptsDir = path.join(tempRoot, "prompts");
  await fs.mkdir(path.join(promptsDir, "manifests"), { recursive: true });
  await fs.mkdir(path.join(promptsDir, "system"), { recursive: true });
  await fs.writeFile(path.join(promptsDir, "system", "base.md"), "Base prompt");
  await fs.writeFile(
    path.join(promptsDir, "manifests", "a.json"),
    JSON.stringify({
      promptKey: "duplicate-key",
      systemFiles: ["system/base.md"]
    })
  );
  await fs.writeFile(
    path.join(promptsDir, "manifests", "b.json"),
    JSON.stringify({
      promptKey: "duplicate-key",
      systemFiles: ["system/base.md"]
    })
  );

  const repository = new FakePromptRepository();
  const registry = new PromptRegistry(
    {
      ...createConfig(),
      promptsDir
    },
    repository as any
  );

  await assert.rejects(
    () => registry.reload(),
    /Duplicate promptKey "duplicate-key" found in prompt manifests: a and b/
  );
});

test("prompt registry reports missing referenced prompt files with manifest context", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "prompt-registry-"));
  const promptsDir = path.join(tempRoot, "prompts");
  await fs.mkdir(path.join(promptsDir, "manifests"), { recursive: true });
  await fs.writeFile(
    path.join(promptsDir, "manifests", "missing-file.json"),
    JSON.stringify({
      promptKey: "missing-file",
      systemFiles: ["system/does-not-exist.md"]
    })
  );

  const repository = new FakePromptRepository();
  const registry = new PromptRegistry(
    {
      ...createConfig(),
      promptsDir
    },
    repository as any
  );

  await assert.rejects(
    () => registry.reload(),
    /Prompt manifest missing-file references missing file system\/does-not-exist\.md/
  );
});
