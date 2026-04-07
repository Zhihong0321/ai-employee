import { loadConfig } from "../config.js";
import { Database } from "../database/database.js";
import { Repository } from "../database/repository.js";
import { LlmRouter } from "../llm/llm-router.js";
import { PromptRegistry } from "../prompts/prompt-registry.js";
import { SkillRegistry } from "../skills/skill-registry.js";
import { OpenAiService } from "../services/openai-service.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Database(config.databaseUrl, config.companyReadDatabaseUrl, config.databaseSchema);

  try {
    await database.initialize();
    await database.agentPool.query("SELECT 1");
    console.log("agent_db: ok");

    if (database.companyPool) {
      await database.companyPool.query("SELECT 1");
      console.log("company_db: ok");
    } else {
      console.log("company_db: skipped (not configured)");
    }

    const repository = new Repository(database.agentPool);
    const llmRouter = new LlmRouter(config, repository);
    const promptRegistry = new PromptRegistry(config, repository);
    const skillRegistry = new SkillRegistry(config, repository);
    await skillRegistry.initialize();
    const openAiService = new OpenAiService(config, llmRouter, promptRegistry);
    if (openAiService.isEnabled()) {
      await openAiService.ping();
      console.log("openai: ok");
    } else {
      console.log("openai: skipped (not configured)");
    }
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error("healthcheck failed", error);
  process.exit(1);
});
