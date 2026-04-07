import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

async function resolveMigrationsDir(): Promise<string> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(moduleDir, "migrations"),
    path.resolve(process.cwd(), "dist/database/migrations"),
    path.resolve(process.cwd(), "src/database/migrations")
  ];

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isDirectory()) {
        return candidate;
      }
    } catch {
      // Try the next likely location.
    }
  }

  throw new Error(`Unable to locate migrations directory. Checked: ${candidates.join(", ")}`);
}

export async function runMigrations(pool: Pool): Promise<void> {
  const migrationsDir = await resolveMigrationsDir();
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const existing = await pool.query("SELECT 1 FROM schema_migrations WHERE id = $1", [file]);
    if (existing.rowCount) {
      continue;
    }

    const fullPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(fullPath, "utf8");

    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }
  }
}
