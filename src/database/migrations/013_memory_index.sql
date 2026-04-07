CREATE TABLE IF NOT EXISTS memory_index (
  id BIGSERIAL PRIMARY KEY,
  memory_key TEXT NOT NULL UNIQUE,
  memory_type TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'global',
  scope_id TEXT,
  title TEXT,
  summary TEXT NOT NULL,
  source_table TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  entities TEXT[] NOT NULL DEFAULT '{}',
  importance_score NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  freshness_score NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  confidence NUMERIC(4,3),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memory_index_scope_idx
ON memory_index (scope_type, scope_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS memory_index_type_idx
ON memory_index (memory_type, updated_at DESC);

CREATE INDEX IF NOT EXISTS memory_index_updated_idx
ON memory_index (updated_at DESC);
