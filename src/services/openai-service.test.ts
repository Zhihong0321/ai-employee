import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, test } from "vitest";
import { OpenAiService } from "./openai-service.js";

type TestContext = {
  service: OpenAiService;
  router: {
    isConfigured: () => boolean;
    generateText: (input: any) => Promise<string>;
    generateJson: (input: any) => Promise<any>;
    ping: (provider?: string, model?: string) => Promise<void>;
  };
};

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
  tempDirs = [];
});

async function createTempFile(fileName: string, content: string | Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "openai-service-test-"));
  tempDirs.push(dir);
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, content);
  return filePath;
}

function createService(): TestContext {
  const router = {
    isConfigured: () => true,
    generateText: async () => "router summary",
    generateJson: async () => ({}),
    ping: async () => {}
  };

  const service = new OpenAiService(
    {
      port: 3000,
      databaseUrl: "postgres://example",
      databaseSchema: "ai_employee",
      companyReadDatabaseUrl: "postgres://example",
      openAiApiKey: undefined,
      uniApiApiKey: "test-key",
      uniApiGeminiBaseUrl: "https://example.com/gemini",
      uniApiOpenAiBaseUrl: "https://example.com/openai",
      llmRouterProvider: "uniapi-gemini",
      llmRouterModel: "gemini-3.1-flash-lite-preview",
      openAiReasoningModel: "gpt-5.4-mini",
      openAiVisionModel: "gpt-5.4-mini",
      openAiTranscribeModel: "gpt-4o-transcribe",
      healthcheckModel: "gemini-3.1-flash-lite-preview",
      whatsappAuthDir: "/tmp/whatsapp-auth",
      mediaStorageDir: "/tmp/media",
      promptsDir: "/tmp/prompts",
      skillsDir: "/tmp/skills",
      adminApiToken: undefined,
      bootstrapWhatsappNumber: undefined,
      botName: undefined,
      botAliases: [],
      botRoleDescription: undefined,
      autonomyMode: "low-risk",
      testerWhatsappNumbers: [],
      sdmoTokenThreshold: 15000,
      sdmoOptimizerCooldownMinutes: 30,
      sdmoContextBudgetTokens: 20000
    } as any,
    router as any,
    {} as any
  );

  return { service, router };
}

test("analyzeImage uses Gemini multimodal analysis when available", async () => {
  const { service } = createService();
  const filePath = await createTempFile("receipt.png", Buffer.from("fake image bytes"));
  let captured: any;

  (service as any).geminiClient = {
    models: {
      generateContent: async (input: any) => {
        captured = input;
        return { text: "Gemini image summary" };
      }
    }
  };
  (service as any).client = undefined;

  const result = await service.analyzeImage(filePath, "image/png");

  assert.equal(result, "Gemini image summary");
  assert.ok(captured);
  assert.equal(captured.model, "gemini-3.1-flash-lite-preview");
  assert.equal(captured.contents.parts[1].inlineData.mimeType, "image/png");
});

test("analyzeDocument summarizes extracted text through the router", async () => {
  const { service, router } = createService();
  const filePath = await createTempFile("policy.txt", "hello policy");
  let captured: any;

  (service as any).geminiClient = undefined;
  router.generateText = async (input: any) => {
    captured = input;
    return "router document summary";
  };

  const result = await service.analyzeDocument(filePath, "text/plain", "First line\nSecond line");

  assert.equal(result, "router document summary");
  assert.ok(captured);
  assert.match(captured.prompt, /First line/);
  assert.match(captured.prompt, /Extracted text/);
});

test("analyzeDocument uses Gemini directly for PDFs when available", async () => {
  const { service } = createService();
  const filePath = await createTempFile("invoice.pdf", Buffer.from("%PDF-1.4 fake pdf"));
  let captured: any;

  (service as any).geminiClient = {
    models: {
      generateContent: async (input: any) => {
        captured = input;
        return { text: "Gemini PDF summary" };
      }
    }
  };
  (service as any).client = undefined;

  const result = await service.analyzeDocument(filePath, "application/pdf", null);

  assert.equal(result, "Gemini PDF summary");
  assert.ok(captured);
  assert.equal(captured.contents.parts[1].inlineData.mimeType, "application/pdf");
});
