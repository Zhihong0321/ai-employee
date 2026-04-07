import { Pool } from "pg";
import { runMigrations } from "./migrator.js";

export class Database {
  public readonly agentPool: Pool;
  public readonly companyPool?: Pool;

  constructor(databaseUrl: string, companyReadDatabaseUrl?: string) {
    this.agentPool = new Pool({ connectionString: databaseUrl });
    this.companyPool = companyReadDatabaseUrl
      ? new Pool({ connectionString: companyReadDatabaseUrl })
      : undefined;
  }

  async initialize(): Promise<void> {
    await runMigrations(this.agentPool);
  }

  async close(): Promise<void> {
    await this.agentPool.end();
    if (this.companyPool) {
      await this.companyPool.end();
    }
  }
}
