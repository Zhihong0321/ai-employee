CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  whatsapp_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT,
  branch TEXT,
  authority_level INTEGER,
  domains TEXT[] NOT NULL DEFAULT '{}',
  is_human_api BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  external_id TEXT NOT NULL UNIQUE,
  chat_id TEXT NOT NULL,
  sender_number TEXT NOT NULL,
  sender_name TEXT,
  direction TEXT NOT NULL,
  kind TEXT NOT NULL,
  text_content TEXT,
  transcript TEXT,
  analysis TEXT,
  media_path TEXT,
  mime_type TEXT,
  raw_payload JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages (chat_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS messages_sender_number_idx ON messages (sender_number, occurred_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_assets (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  title TEXT,
  mime_type TEXT,
  text_content TEXT,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id BIGSERIAL PRIMARY KEY,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  value TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence NUMERIC(4,3),
  source_message_external_id TEXT,
  source_contact_number TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facts (
  id BIGSERIAL PRIMARY KEY,
  fact_key TEXT NOT NULL UNIQUE,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  value TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'working',
  confidence NUMERIC(4,3),
  source_claim_id BIGINT REFERENCES claims(id) ON DELETE SET NULL,
  source_contact_number TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  requested_by TEXT,
  target_number TEXT,
  due_at TIMESTAMPTZ,
  source_message_external_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  source_task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
  created_by TEXT,
  locked_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON scheduled_jobs (status, run_at);

CREATE TABLE IF NOT EXISTS decision_logs (
  id BIGSERIAL PRIMARY KEY,
  message_external_id TEXT,
  decision_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS query_cache (
  id BIGSERIAL PRIMARY KEY,
  question TEXT NOT NULL UNIQUE,
  answer TEXT NOT NULL,
  source TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clarification_threads (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_by_message_external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_hub_versions (
  id BIGSERIAL PRIMARY KEY,
  prompt_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prompt_key, version)
);
