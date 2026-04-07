import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";
import { DebugService } from "../debug/debug-service.js";
import { normalizePhoneNumber } from "../lib/phone.js";
import { InboundMessage } from "../types.js";
import { AgentService } from "./agent-service.js";

export class TesterWhatsAppAgentService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository,
    private readonly debugService: DebugService,
    private readonly agentService: AgentService
  ) {}

  async handleInboundMessage(message: InboundMessage): Promise<void> {
    const senderNumber = normalizePhoneNumber(message.senderNumber);
    const runtimeTesterNumbers = await this.repository.getTesterWhatsappNumbers();
    const testerNumbers =
      runtimeTesterNumbers.length > 0 ? runtimeTesterNumbers : this.config.testerWhatsappNumbers;
    const allowAllTesters = testerNumbers.length === 0;
    const isAllowedTester = allowAllTesters || testerNumbers.includes(senderNumber);
    const runId = this.debugService.createRunId("tester_gate");

    if (!isAllowedTester) {
      const skipReason =
        "Skipped live AI handling because sender is outside tester allowlist";

      await this.debugService.log({
        runId,
        messageExternalId: message.externalId,
        stage: "policy_validation",
        summary: skipReason,
        payload: {
          senderNumber,
          testerCount: testerNumbers.length,
          testerNumbers
        },
        severity: "warn",
        force: true
      });

      await this.repository.addDecisionLog(
        message.externalId,
        "tester_whatsapp_skip",
        skipReason,
        {
          senderNumber,
          testerCount: testerNumbers.length,
          testerNumbers
        }
      );
      return;
    }

    const existingContact = await this.repository.getContactByNumber(senderNumber);
    await this.repository.upsertContact({
      whatsappNumber: senderNumber,
      whatsappLid: message.senderLid ?? existingContact?.whatsapp_lid ?? null,
      name: existingContact?.name ?? message.senderName ?? senderNumber,
      role: existingContact?.role ?? null,
      branch: existingContact?.branch ?? null,
      authorityLevel: existingContact?.authority_level != null ? Number(existingContact.authority_level) : null,
      domains: Array.isArray(existingContact?.domains) ? existingContact.domains : [],
      isHumanApi: Boolean(existingContact?.is_human_api),
      notes: existingContact?.notes ?? "Tester contact for live WhatsApp AI validation.",
      source: existingContact?.source ?? "tester_whatsapp_validation",
      isInternal: existingContact?.is_internal ?? false,
      department: existingContact?.department ?? null,
      relationType: existingContact?.relation_type ?? null,
      aboutPerson: existingContact?.about_person ?? null,
      autonomousOutreach: true
    });

    await this.debugService.log({
      runId,
      messageExternalId: message.externalId,
      stage: "policy_validation",
      summary: "Accepted tester WhatsApp sender for live AI handling",
      payload: {
        senderNumber,
        testerNumbers,
        allowAllTesters
      },
      force: true
    });

    await this.agentService.handleInboundMessage(message);
  }
}
