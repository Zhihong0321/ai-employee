-- ============================================================
-- Migration 014: SDMO Schema Enrichment (Phase 0)
-- Schema Driven Memory Optimization — foundation columns.
-- No behaviour change. Fully backward compatible.
-- ============================================================

-- ---------------------------------------------------------
-- facts: memory_tier
--   1 = Tier 1 (Persistent) — always injected into prompt
--   2 = Tier 2 (Working)    — default, injected when relevant
--   3 = Tier 3 (Archive)    — never auto-injected, MCP only
-- ---------------------------------------------------------
ALTER TABLE facts
  ADD COLUMN IF NOT EXISTS memory_tier INTEGER NOT NULL DEFAULT 2;

CREATE INDEX IF NOT EXISTS facts_memory_tier_idx
  ON facts (memory_tier, updated_at DESC);

-- ---------------------------------------------------------
-- task_events: is_archived
--   FALSE = live event, eligible for prompt injection
--   TRUE  = archived by optimizer; queryable via MCP only
-- ---------------------------------------------------------
ALTER TABLE task_events
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS task_events_archived_idx
  ON task_events (task_id, is_archived, created_at DESC);

-- ---------------------------------------------------------
-- tasks: SDMO optimization tracking
--   last_optimized_at   — prevents double-optimization race
--   sdmo_optimization_count — audit trail for # of optimizer runs
-- ---------------------------------------------------------
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS last_optimized_at TIMESTAMPTZ;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sdmo_optimization_count INTEGER NOT NULL DEFAULT 0;
