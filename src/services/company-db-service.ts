import { Pool } from "pg";

const READ_ONLY_PATTERN = /^\s*(select|with)\s+/i;
const BLOCKED_PATTERN = /\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i;

export class CompanyDbService {
  constructor(private readonly pool?: Pool) {}

  async runReadOnlyQuery(query: string): Promise<{ rows: any[]; rowCount: number }> {
    if (!this.pool) {
      throw new Error("Company read database is not configured");
    }

    const trimmed = query.trim();
    if (!READ_ONLY_PATTERN.test(trimmed) || BLOCKED_PATTERN.test(trimmed)) {
      throw new Error("Only read-only SELECT/WITH queries are allowed");
    }

    const result = await this.pool.query(trimmed);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? 0
    };
  }

  async ping(): Promise<void> {
    if (!this.pool) {
      throw new Error("Company read database is not configured");
    }

    await this.pool.query("SELECT 1");
  }
}
