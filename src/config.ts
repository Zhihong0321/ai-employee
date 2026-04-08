import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  port: number;
  databaseUrl: string;
  databaseSchema: string;
  companyReadDatabaseUrl?: string;
  openAiApiKey?: string;
  uniApiApiKey?: string;
  uniApiGeminiBaseUrl: string;
  uniApiOpenAiBaseUrl: string;
  llmRouterProvider: "uniapi-gemini" | "uniapi-openai" | "openai";
  llmRouterModel: string;
  openAiReasoningModel: string;
  openAiVisionModel: string;
  openAiTranscribeModel: string;
  healthcheckModel: string;
  whatsappAuthDir: string;
  mediaStorageDir: string;
  promptsDir: string;
  skillsDir: string;
  adminApiToken?: string;
  bootstrapWhatsappNumber?: string;
  botName?: string;
  botAliases?: string[];
  botRoleDescription?: string;
  autonomyMode: "low-risk" | "wide";
  testerWhatsappNumbers: string[];
  /** SDMO: Token count in a single LLM call that triggers the Memory Optimizer. Default: 15000 */
  sdmoTokenThreshold: number;
  /** SDMO: Minimum minutes between optimizer runs per task. Default: 30 */
  sdmoOptimizerCooldownMinutes: number;
  /** SDMO: Hard prompt budget for assembled runner context. Default: 20000 */
  sdmoContextBudgetTokens: number;
};


function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function resolvePath(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

function resolvePersistentPath(envValue: string | undefined, fallbackName: string): string {
  if (envValue?.trim()) {
    return resolvePath(envValue.trim());
  }

  if (fs.existsSync("/storage")) {
    return resolvePath(path.join("/storage", fallbackName));
  }

  return resolvePath(path.join("./data", fallbackName));
}

function parseWhatsappNumberList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const hasPlus = item.startsWith("+");
      const digits = item.replace(/[^\d]/g, "");
      return hasPlus ? `+${digits}` : digits;
    });
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required("DATABASE_URL"),
    databaseSchema: process.env.DATABASE_SCHEMA?.trim() || "ai_employee",
    companyReadDatabaseUrl: process.env.COMPANY_READ_DATABASE_URL || undefined,
    openAiApiKey: process.env.OPENAI_API_KEY || undefined,
    uniApiApiKey: process.env.UNIAPI_API_KEY || undefined,
    uniApiGeminiBaseUrl: process.env.UNIAPI_GEMINI_BASE_URL ?? "https://api.uniapi.io/gemini",
    uniApiOpenAiBaseUrl: process.env.UNIAPI_OPENAI_BASE_URL ?? "https://api.uniapi.io/v1",
    llmRouterProvider:
      process.env.LLM_ROUTER_PROVIDER === "openai"
        ? "openai"
        : process.env.LLM_ROUTER_PROVIDER === "uniapi-openai"
          ? "uniapi-openai"
          : "uniapi-gemini",
    llmRouterModel: process.env.LLM_ROUTER_MODEL ?? "gemini-3.1-flash-lite-preview",
    openAiReasoningModel: process.env.OPENAI_REASONING_MODEL ?? "gpt-5.4-mini",
    openAiVisionModel: process.env.OPENAI_VISION_MODEL ?? "gpt-5.4-mini",
    openAiTranscribeModel: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe",
    healthcheckModel: process.env.HEALTHCHECK_MODEL ?? "gpt-5.4-mini",
    whatsappAuthDir: resolvePersistentPath(process.env.WHATSAPP_AUTH_DIR, "baileys-auth"),
    mediaStorageDir: resolvePersistentPath(process.env.MEDIA_STORAGE_DIR, "media"),
    promptsDir: resolvePath(process.env.PROMPTS_DIR ?? "./prompts"),
    skillsDir: resolvePath(process.env.SKILLS_DIR ?? "./skills"),
    adminApiToken: process.env.ADMIN_API_TOKEN || undefined,
    bootstrapWhatsappNumber: process.env.BOOTSTRAP_WHATSAPP_NUMBER || undefined,
    botName: process.env.BOT_NAME?.trim() || undefined,
    botAliases: (process.env.BOT_ALIASES ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    botRoleDescription: process.env.BOT_ROLE_DESCRIPTION?.trim() || undefined,
    autonomyMode: process.env.AUTONOMY_MODE === "wide" ? "wide" : "low-risk",
    testerWhatsappNumbers: parseWhatsappNumberList(process.env.TESTER_WHATSAPP_NUMBERS),
    sdmoTokenThreshold: Number(process.env.SDMO_TOKEN_THRESHOLD ?? 15000),
    sdmoOptimizerCooldownMinutes: Number(process.env.SDMO_OPTIMIZER_COOLDOWN_MINUTES ?? 30),
    sdmoContextBudgetTokens: Number(process.env.SDMO_CONTEXT_BUDGET_TOKENS ?? 20000)
  };

}
