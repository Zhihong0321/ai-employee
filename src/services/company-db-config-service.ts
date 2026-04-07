import { AppConfig } from "../config.js";
import { Repository } from "../database/repository.js";

const COMPANY_DB_CONFIG_SETTING_KEY = "company_db_config";

export type CompanyDbConfig = {
  connectionString: string | null;
};

export class CompanyDbConfigService {
  constructor(
    private readonly config: AppConfig,
    private readonly repository: Repository
  ) {}

  async getConfig(): Promise<CompanyDbConfig> {
    const stored = await this.repository.getSetting<Partial<CompanyDbConfig>>(COMPANY_DB_CONFIG_SETTING_KEY);
    const configured = String(stored?.connectionString ?? "").trim();
    return {
      connectionString: configured || null
    };
  }

  async saveConfig(input: Partial<CompanyDbConfig>): Promise<CompanyDbConfig> {
    const next: CompanyDbConfig = {
      connectionString: String(input.connectionString ?? "").trim() || null
    };

    await this.repository.saveSetting(COMPANY_DB_CONFIG_SETTING_KEY, next);
    return next;
  }

  async getEffectiveConnectionString(): Promise<string | null> {
    const stored = await this.getConfig();
    return stored.connectionString || this.config.companyReadDatabaseUrl || null;
  }

  async getStatus(): Promise<{
    configured: boolean;
    source: "ui" | "env" | "none";
  }> {
    const stored = await this.getConfig();
    if (stored.connectionString) {
      return {
        configured: true,
        source: "ui"
      };
    }

    if (this.config.companyReadDatabaseUrl) {
      return {
        configured: true,
        source: "env"
      };
    }

    return {
      configured: false,
      source: "none"
    };
  }
}
