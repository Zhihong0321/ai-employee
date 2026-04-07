import { AppConfig } from "../config.js";
import { Database } from "../database/database.js";
import { HealthReport } from "../types.js";
import { OpenAiService } from "./openai-service.js";

export class HealthService {
  constructor(
    private readonly config: AppConfig,
    private readonly database: Database,
    private readonly openAiService: OpenAiService,
    private readonly whatsappService?: { isConnected: () => boolean }
  ) {}

  async basic(): Promise<HealthReport> {
    const checks: HealthReport["checks"] = [];

    try {
      await this.database.agentPool.query("SELECT 1");
      checks.push({
        name: "agent_db",
        ok: true,
        detail: "Agent database reachable"
      });
    } catch (error) {
      checks.push({
        name: "agent_db",
        ok: false,
        detail: error instanceof Error ? error.message : "Agent database unreachable"
      });
    }

    checks.push({
      name: "whatsapp",
      ok: this.config.enableWhatsapp ? Boolean(this.whatsappService?.isConnected()) : true,
      detail: this.config.enableWhatsapp
        ? this.whatsappService?.isConnected()
          ? "WhatsApp socket connected"
          : "WhatsApp enabled but not connected yet"
        : "WhatsApp disabled by config"
    });

    return {
      status: checks.every((check) => check.ok) ? "ok" : "degraded",
      checks
    };
  }

  async full(): Promise<HealthReport> {
    const report = await this.basic();
    const checks = [...report.checks];

    try {
      if (this.database.companyPool) {
        await this.database.companyPool.query("SELECT 1");
        checks.push({
          name: "company_db",
          ok: true,
          detail: "Company read database reachable"
        });
      } else {
        checks.push({
          name: "company_db",
          ok: false,
          detail: "COMPANY_READ_DATABASE_URL not configured"
        });
      }
    } catch (error) {
      checks.push({
        name: "company_db",
        ok: false,
        detail: error instanceof Error ? error.message : "Company read database unreachable"
      });
    }

    const openAiHealth = await this.openAiService.buildHealthReport();
    checks.push(...openAiHealth.checks);

    return {
      status: checks.every((check) => check.ok) ? "ok" : checks.some((check) => check.ok) ? "degraded" : "failed",
      checks
    };
  }
}
