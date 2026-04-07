import { loadConfig } from "./config.js";
import { createApp } from "./http/create-app.js";
import { Database } from "./database/database.js";
import { Repository } from "./database/repository.js";
import path from "node:path";
import { LlmRouter } from "./llm/llm-router.js";
import { AgentService } from "./services/agent-service.js";
import { BootstrapService } from "./services/bootstrap-service.js";
import { CompanyDbService } from "./services/company-db-service.js";
import { CompanyDbConfigService } from "./services/company-db-config-service.js";
import { HealthService } from "./services/health-service.js";
import { MediaService } from "./services/media-service.js";
import { OpenAiService } from "./services/openai-service.js";
import { SchedulerService } from "./services/scheduler-service.js";
import { WhatsAppOnboardingService } from "./services/whatsapp-onboarding-service.js";
import { WhatsAppPlaygroundService } from "./services/whatsapp-playground-service.js";
import { WhatsAppService } from "./services/whatsapp-service.js";
import { WhatsAppIntakeService } from "./services/whatsapp-intake-service.js";
import { TesterWhatsAppAgentService } from "./services/tester-whatsapp-agent-service.js";
import { MemoryBrowserService } from "./services/memory-browser-service.js";
import { AgentIdentityService } from "./services/agent-identity-service.js";
import { AuthorityPolicyService } from "./services/authority-policy-service.js";
import { ReactionClassifier } from "./agent/reaction-classifier.js";
import { AgentRunner } from "./agent/runner.js";
import { AgentToolExecutor } from "./agent/executor.js";
import { AgentPolicyEngine } from "./agent/policy-core.js";
import { PromptRegistry } from "./prompts/prompt-registry.js";
import { DebugService } from "./debug/debug-service.js";
import { SkillRegistry } from "./skills/skill-registry.js";
import { SkillSelector } from "./skills/skill-selector.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Database(config.databaseUrl, config.companyReadDatabaseUrl, config.databaseSchema);
  await database.initialize();

  const repository = new Repository(database.agentPool);
  const promptRegistry = new PromptRegistry(config, repository);
  await promptRegistry.initialize();
  const skillRegistry = new SkillRegistry(config, repository);
  await skillRegistry.initialize();
  const debugService = new DebugService(repository);

  const bootstrapService = new BootstrapService(repository);
  if (config.bootstrapWhatsappNumber) {
    await bootstrapService.ensureBootstrapContact({
      whatsappNumber: config.bootstrapWhatsappNumber,
      name: "Primary Initiator",
      role: "Initiator",
      authorityLevel: 5,
      domains: ["company_bootstrap", "operations"],
      notes: "Bootstrap contact seeded from environment variable."
    });
  }

  for (const testerNumber of config.testerWhatsappNumbers) {
    await repository.upsertContact({
      whatsappNumber: testerNumber,
      name: testerNumber,
      isHumanApi: false,
      notes: "Tester contact allowlisted for live WhatsApp AI validation.",
      source: "tester_whatsapp_validation",
      autonomousOutreach: true
    });
  }

  const llmRouter = new LlmRouter(config, repository);
  const openAiService = new OpenAiService(config, llmRouter, promptRegistry);
  const companyDbConfigService = new CompanyDbConfigService(config, repository);
  const companyDbService = new CompanyDbService(companyDbConfigService);
  const skillSelector = new SkillSelector(skillRegistry);
  const memoryBrowserService = new MemoryBrowserService(repository);
  const agentIdentityService = new AgentIdentityService(config, repository);
  const authorityPolicyService = new AuthorityPolicyService(repository);
  const agentService = new AgentService(
    config,
    repository,
    debugService,
    openAiService,
    companyDbService,
    skillSelector,
    memoryBrowserService,
    agentIdentityService,
    authorityPolicyService
  );
  const whatsappPlaygroundService = new WhatsAppPlaygroundService(repository);
  const mediaService = new MediaService(config.mediaStorageDir);

  // Agentic Core
  const reactionClassifier = new ReactionClassifier(llmRouter, promptRegistry);
  const agentPolicyEngine = new AgentPolicyEngine(repository);
  const agentToolExecutor = new AgentToolExecutor(repository, debugService, agentPolicyEngine);
  const agentRunner = new AgentRunner(
    llmRouter,
    repository,
    agentToolExecutor,
    promptRegistry,
    debugService,
    skillSelector,
    memoryBrowserService,
    agentIdentityService
  );
  const testerWhatsAppAgentService = new TesterWhatsAppAgentService(config, repository, debugService, agentService);
  const whatsappIntakeService = new WhatsAppIntakeService(
    repository,
    debugService,
    reactionClassifier,
    agentIdentityService,
    authorityPolicyService,
    config.whatsappMode === "agent" ? testerWhatsAppAgentService : undefined
  );

  const whatsappService = new WhatsAppService(config.whatsappAuthDir, mediaService, openAiService, whatsappIntakeService, {
    enableMediaAi: config.whatsappMode === "agent",
    captureOwnMessages: true,
    messageRecorder: whatsappPlaygroundService
  });

  const sender = {
    sendText: (targetNumber: string, text: string) => whatsappService.sendText(targetNumber, text),
    getOwnNumber: () => whatsappService.getOwnNumber()
  };
  agentService.setWhatsappSender(sender);
  agentToolExecutor.setMessenger(sender);
  whatsappPlaygroundService.setWhatsappSender(sender);
  whatsappIntakeService.setOwnNumberResolver(() => sender.getOwnNumber?.() ?? null);

  const schedulerService = new SchedulerService(repository, agentService, debugService, agentRunner);
  const healthService = new HealthService(config, database, openAiService, companyDbService, whatsappService);
  const whatsappOnboardingService = new WhatsAppOnboardingService(
    path.join(path.dirname(config.whatsappAuthDir), "baileys-onboarding-auth"),
    config.whatsappAuthDir,
    () => whatsappService.restart()
  );
  const app = createApp({
    config,
    repository,
    llmRouter,
    agentService,
    bootstrapService,
    healthService,
    whatsappOnboardingService,
    whatsappPlaygroundService,
    promptRegistry,
    skillRegistry,
    debugService,
    agentIdentityService,
    authorityPolicyService,
    companyDbService,
    companyDbConfigService,
    activateWhatsAppSession: () => whatsappService.restart(),
    getOwnWhatsappNumber: () => whatsappService?.getOwnNumber() ?? null,
    getWhatsAppRuntimeDiagnostics: () => whatsappService.getRuntimeDiagnostics(),
    listWhatsAppGroups: () => whatsappService.listParticipatingGroups(),
    getWhatsAppGroupMetadata: (chatId: string) => whatsappService.getGroupMetadata(chatId)
  });

  app.listen(config.port, () => {
    console.log(`HTTP server listening on port ${config.port}`);
  });

  schedulerService.start();

  await whatsappService.start();
}

main().catch((error) => {
  console.error("Fatal startup error", error);
  process.exit(1);
});
