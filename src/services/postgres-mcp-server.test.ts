import test from "node:test";
import assert from "node:assert/strict";
import { PostgresMcpServer } from "./postgres-mcp-server.js";

class FakePool {
  public calls: Array<{ sql: string; params: unknown[] }> = [];
  public rows: Record<string, unknown>[] = [];

  async query(sql: string, params: unknown[] = []): Promise<any> {
    this.calls.push({ sql, params });
    return {
      rows: this.rows,
      rowCount: this.rows.length
    };
  }
}

test("postgres MCP rejects non-SELECT statements", async () => {
  const pool = new FakePool();
  const server = new PostgresMcpServer(pool as any);

  const result = await server.query("UPDATE tasks SET status = 'COMPLETED'");

  assert.equal(result.error, "Only SELECT statements are permitted.");
  assert.equal(pool.calls.length, 0);
});

test("postgres MCP rejects multiple statements", async () => {
  const pool = new FakePool();
  const server = new PostgresMcpServer(pool as any);

  const result = await server.query("SELECT id FROM tasks; SELECT id FROM contacts");

  assert.equal(result.error, "Multiple statements are not allowed.");
  assert.equal(pool.calls.length, 0);
});

test("postgres MCP rejects queries against tables outside the allowlist", async () => {
  const pool = new FakePool();
  const server = new PostgresMcpServer(pool as any);

  const result = await server.query("SELECT * FROM pg_tables");

  assert.equal(result.error, 'Table "pg_tables" is not exposed to query_database.');
  assert.equal(pool.calls.length, 0);
});

test("postgres MCP injects a hard row limit for allowed queries", async () => {
  const pool = new FakePool();
  pool.rows = [{ id: 1 }];
  const server = new PostgresMcpServer(pool as any);

  const result = await server.query("SELECT id FROM tasks WHERE status = 'TODO'");

  assert.equal(result.error, undefined);
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].sql, /LIMIT 50$/);
});

test("postgres MCP preserves smaller existing limits on allowed queries", async () => {
  const pool = new FakePool();
  pool.rows = [{ count: 3 }];
  const server = new PostgresMcpServer(pool as any);

  const result = await server.query("SELECT id FROM knowledge_assets ORDER BY created_at DESC LIMIT 5");

  assert.equal(result.error, undefined);
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].sql, /LIMIT 5$/);
});
