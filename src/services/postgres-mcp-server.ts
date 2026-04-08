import { Pool } from "pg";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type McpQueryResult = {
  /** Rows returned. Array of plain objects. */
  rows: Record<string, unknown>[];
  /** Total rows returned (before the hard limit). */
  rowCount: number;
  /** True if the result was truncated to the hard row limit. */
  truncated: boolean;
  /** Error message if the query failed, otherwise undefined. */
  error?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum rows returned from any single MCP query. Enforced server-side. */
const HARD_ROW_LIMIT = 50;

/**
 * Tables the agent is allowed to query.
 * System tables (pg_* / information_schema) are blocked implicitly by the
 * read-only DB role, but we add an explicit allowlist as defense-in-depth.
 */
const ALLOWED_TABLE_PREFIXES = [
  "tasks",
  "task_events",
  "contacts",
  "messages",
  "facts",
  "memory_index",
  "knowledge_assets",
  "claims",
  "scheduled_jobs",
  "llm_call_logs",
  "debug_records",
  "decision_logs",
  "query_cache",
  "clarification_threads",
  "system_settings",
  "prompt_hub_versions",
  "skill_hub_versions",
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * PostgresMcpServer — SDMO Phase 4
 *
 * Exposes a `query_database` tool that allows the agent to SELECT from its
 * own Postgres database on demand. Key safety properties:
 *
 *  - Only SELECT statements are accepted (non-SELECT is rejected immediately).
 *  - A LIMIT clause of up to 50 rows is injected unless the query already
 *    specifies a smaller LIMIT.
 *  - Parameterized queries are accepted; raw SQL is executed via the pool.
 *  - The pool MUST be connected with a read-only Postgres role. This service
 *    trusts the connection-level constraint as the primary guard.
 *
 * Design rule: Zero coupling to AgentRunner or any intake path. This service
 * is only called by AgentToolExecutor.
 */
export class PostgresMcpServer {
  constructor(private readonly pool: Pool) {}

  /**
   * Execute a SELECT query and return structured results.
   *
   * @param sql    Raw SQL string. Must start with SELECT.
   * @param params Positional parameters ($1, $2, …) for the query.
   */
  async query(sql: string, params: unknown[] = []): Promise<McpQueryResult> {
    // ── 1. Validate: SELECT only ─────────────────────────────────────────────
    const normalized = sql.trim().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
      return {
        rows: [],
        rowCount: 0,
        truncated: false,
        error: "Only SELECT statements are permitted."
      };
    }

    // ── 2. Validate: no multiple statements (semicolons mid-query) ───────────
    // Strip any trailing semicolon then check for remaining ones.
    const withoutTrailingSemicolon = sql.trim().replace(/;\s*$/, "");
    if (withoutTrailingSemicolon.includes(";")) {
      return {
        rows: [],
        rowCount: 0,
        truncated: false,
        error: "Multiple statements are not allowed."
      };
    }

    // ── 3. Validate: only approved agent-memory tables may be queried ───────
    const tableExposureError = validateTableExposure(withoutTrailingSemicolon);
    if (tableExposureError) {
      return {
        rows: [],
        rowCount: 0,
        truncated: false,
        error: tableExposureError
      };
    }

    // ── 4. Inject hard row limit ─────────────────────────────────────────────
    const limitedSql = injectHardLimit(withoutTrailingSemicolon, HARD_ROW_LIMIT);

    // ── 5. Execute ──────────────────────────────────────────────────────────
    try {
      const result = await this.pool.query(limitedSql, params);
      const rows = result.rows as Record<string, unknown>[];
      const truncated = rows.length >= HARD_ROW_LIMIT;

      return {
        rows,
        rowCount: rows.length,
        truncated
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[PostgresMcpServer] Query failed:", message);
      return {
        rows: [],
        rowCount: 0,
        truncated: false,
        error: `Query execution failed: ${message}`
      };
    }
  }

  /**
   * Format a McpQueryResult as a compact string suitable for injection into
   * an LLM context window.
   */
  static formatResult(result: McpQueryResult): string {
    if (result.error) {
      return `ERROR: ${result.error}`;
    }

    if (result.rowCount === 0) {
      return "Query returned 0 rows.";
    }

    const truncationNote = result.truncated
      ? `\n[Result truncated to ${HARD_ROW_LIMIT} rows. Use WHERE / LIMIT to narrow your query.]`
      : "";

    const rowsText = result.rows
      .map((row, i) => `Row ${i + 1}: ${JSON.stringify(row)}`)
      .join("\n");

    return `${result.rowCount} row(s) returned:\n${rowsText}${truncationNote}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateTableExposure(sql: string): string | null {
  const referencedTables = extractReferencedTables(sql);
  const disallowedTable = referencedTables.find(
    (table) => !ALLOWED_TABLE_PREFIXES.includes(table.toLowerCase())
  );

  return disallowedTable
    ? `Table "${disallowedTable}" is not exposed to query_database.`
    : null;
}

function extractReferencedTables(sql: string): string[] {
  const tables = new Set<string>();
  const regex = /\b(?:FROM|JOIN)\s+(?!\()(?:(?:"?([a-z_][\w$]*)"?\.)?"?([a-z_][\w$]*)"?)/gi;

  for (const match of sql.matchAll(regex)) {
    const schemaOrTable = match[1];
    const bareTable = match[2];
    const tableName = bareTable ?? schemaOrTable;
    if (tableName) {
      tables.add(tableName);
    }
  }

  return [...tables];
}

/**
 * Inject a LIMIT N clause into a SQL SELECT string if the existing LIMIT
 * exceeds the hard cap or no LIMIT is present.
 *
 * Conservative: uses string matching. The goal is to cap runaway queries —
 * not to be a full SQL parser.
 */
function injectHardLimit(sql: string, limit: number): string {
  // Detect an existing LIMIT clause (case-insensitive, at the end)
  const limitMatch = sql.match(/\bLIMIT\s+(\d+)\s*$/i);
  if (limitMatch) {
    const existingLimit = parseInt(limitMatch[1], 10);
    if (existingLimit <= limit) {
      // Already within the cap — leave it alone
      return sql;
    }
    // Replace the too-large LIMIT with the capped value
    return sql.replace(/\bLIMIT\s+\d+\s*$/i, `LIMIT ${limit}`);
  }

  // No LIMIT present — append one
  return `${sql} LIMIT ${limit}`;
}
