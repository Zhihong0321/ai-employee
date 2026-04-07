import { Pool } from "pg";
import { runMigrations } from "./migrator.js";

function quoteIdentifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }

  return `"${value}"`;
}

export class Database {
  public readonly agentPool: Pool;
  public readonly companyPool?: Pool;
  private readonly agentSchema: string;

  constructor(databaseUrl: string, companyReadDatabaseUrl?: string, agentSchema = "ai_employee") {
    this.agentSchema = agentSchema;
    this.agentPool = new Pool({ connectionString: databaseUrl });
    const quotedSchema = quoteIdentifier(this.agentSchema);
    this.agentPool.on("connect", (client) => {
      void client.query(`SET search_path TO ${quotedSchema}, public`);
    });
    this.companyPool = companyReadDatabaseUrl
      ? new Pool({ connectionString: companyReadDatabaseUrl })
      : undefined;
  }

  async initialize(): Promise<void> {
    await runMigrations(this.agentPool, this.agentSchema);
  }

  async close(): Promise<void> {
    await this.agentPool.end();
    if (this.companyPool) {
      await this.companyPool.end();
    }
  }
}
