CREATE TABLE IF NOT EXISTS skill_hub_versions (
  id BIGSERIAL PRIMARY KEY,
  skill_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  manifest_name TEXT,
  version_hash TEXT,
  source_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (skill_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS skill_hub_versions_key_hash_uidx
ON skill_hub_versions (skill_id, version_hash)
WHERE version_hash IS NOT NULL;
