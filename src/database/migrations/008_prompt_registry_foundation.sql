ALTER TABLE prompt_hub_versions
ADD COLUMN IF NOT EXISTS manifest_name TEXT,
ADD COLUMN IF NOT EXISTS version_hash TEXT,
ADD COLUMN IF NOT EXISTS source_files JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_hub_versions_key_hash_uidx
ON prompt_hub_versions (prompt_key, version_hash)
WHERE version_hash IS NOT NULL;
