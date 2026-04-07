import { Pool } from "pg";
import { CompanyDbConfigService } from "./company-db-config-service.js";

const READ_ONLY_PATTERN = /^\s*(select|with)\s+/i;
const BLOCKED_PATTERN = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i;

export class CompanyDbService {
  private pool?: Pool;
  private currentConnectionString?: string | null;

  constructor(private readonly configService: CompanyDbConfigService) {}

  async runReadOnlyQuery(query: string): Promise<{ rows: any[]; rowCount: number }> {
    const pool = await this.getPool();

    const trimmed = query.trim();
    if (!READ_ONLY_PATTERN.test(trimmed) || BLOCKED_PATTERN.test(trimmed)) {
      throw new Error("Only read-only SELECT/WITH queries are allowed");
    }

    const result = await pool.query(trimmed);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0
    };
  }

  async ping(): Promise<void> {
    const pool = await this.getPool();
    await pool.query("SELECT 1");
  }

  private async getPool(): Promise<Pool> {
    const connectionString = await this.configService.getEffectiveConnectionString();
    if (!connectionString) {
      throw new Error("Company read database is not configured");
    }

    if (this.pool && this.currentConnectionString === connectionString) {
      return this.pool;
    }

    if (this.pool) {
      await this.pool.end().catch(() => undefined);
    }

    this.pool = new Pool({ connectionString });
    this.currentConnectionString = connectionString;
    return this.pool;
  }
}
