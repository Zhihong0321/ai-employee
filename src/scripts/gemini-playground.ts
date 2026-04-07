import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../config.js";
import { Database } from "../database/database.js";
import { Repository } from "../database/repository.js";
import { LlmRouter } from "../llm/llm-router.js";

type Turn = {
  role: "user" | "assistant";
  text: string;
};

function installBrokenPipeGuard(): void {
  const guard = (error: any) => {
    if (error?.code === "EPIPE") {
      process.exit(0);
    }
  };

  process.stdout.on("error", guard);
  process.stderr.on("error", guard);
}

function buildPrompt(history: Turn[], userInput: string): string {
  const transcript = history
    .map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.text}`)
    .join("\n\n");

  return [transcript, `User: ${userInput}`, "Assistant:"].filter(Boolean).join("\n\n");
}

async function main(): Promise<void> {
  installBrokenPipeGuard();

  const config = loadConfig();
  const database = new Database(config.databaseUrl, config.companyReadDatabaseUrl, config.databaseSchema);
  const provider = config.llmRouterProvider;
  const model = config.llmRouterModel;
  await database.initialize();
  const repository = new Repository(database.agentPool);
  const router = new LlmRouter(config, repository);

  if (!router.isConfigured(provider)) {
    throw new Error(`LLM provider "${provider}" is not configured. Check UNIAPI_API_KEY / router env values.`);
  }

  const rl = readline.createInterface({ input, output });
  const history: Turn[] = [];
  let systemPrompt =
    "You are a concise, helpful playground assistant used to validate that the local LLM router is working.";

  console.log(`Gemini playground ready.`);
  console.log(`Provider: ${provider}`);
  console.log(`Model: ${model}`);
  console.log(`Commands: /exit, /reset, /system <new system prompt>`);

  try {
    while (true) {
      const message = (await rl.question("\nYou> ")).trim();
      if (!message) {
        continue;
      }

      if (message === "/exit") {
        break;
      }

      if (message === "/reset") {
        history.length = 0;
        console.log("Conversation history cleared.");
        continue;
      }

      if (message.startsWith("/system ")) {
        systemPrompt = message.slice("/system ".length).trim() || systemPrompt;
        console.log("System prompt updated.");
        continue;
      }

      const reply = await router.generateText({
        provider,
        model,
        systemPrompt,
        prompt: buildPrompt(history, message),
        temperature: 0.2
      });

      history.push({ role: "user", text: message });
      history.push({ role: "assistant", text: reply });

      console.log(`\nAssistant> ${reply || "(empty response)"}`);
    }
  } finally {
    rl.close();
    await database.close();
  }
}

main().catch((error) => {
  console.error("Gemini playground failed", error);
  process.exit(1);
});
