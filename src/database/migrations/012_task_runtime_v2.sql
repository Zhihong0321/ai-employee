ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS charter JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS snapshot JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS timezone TEXT;

ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS timezone_source TEXT;

ALTER TABLE tasks
ALTER COLUMN status SET DEFAULT 'TODO';

UPDATE tasks
SET status = CASE LOWER(status)
  WHEN 'open' THEN 'TODO'
  WHEN 'in_progress' THEN 'IN_PROGRESS'
  WHEN 'waiting' THEN 'WAITING'
  WHEN 'blocked' THEN 'BLOCKED'
  WHEN 'completed' THEN 'COMPLETED'
  WHEN 'cancelled' THEN 'CANCELLED'
  ELSE UPPER(status)
END
WHERE status IS NOT NULL;

UPDATE tasks
SET
  charter = jsonb_strip_nulls(
    jsonb_build_object(
      'originalIntent', details,
      'requesterNumber', requested_by,
      'targetNumber', target_number,
      'constraints', metadata,
      'sourceMessageExternalId', source_message_external_id
    )
  ),
  snapshot = jsonb_strip_nulls(
    jsonb_build_object(
      'status', status,
      'currentSummary', details,
      'latestKnownContext', jsonb_build_object(
        'sourceMessageExternalId', source_message_external_id
      )
    )
  )
WHERE charter = '{}'::jsonb OR snapshot = '{}'::jsonb;

ALTER TABLE scheduled_jobs
ADD COLUMN IF NOT EXISTS retry_limit INTEGER NOT NULL DEFAULT 3;

ALTER TABLE scheduled_jobs
ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMPTZ;

ALTER TABLE scheduled_jobs
ADD COLUMN IF NOT EXISTS handoff_required BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE scheduled_jobs
ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

ALTER TABLE scheduled_jobs
ADD COLUMN IF NOT EXISTS last_result_summary TEXT;

ALTER TABLE scheduled_jobs
ADD COLUMN IF NOT EXISTS timezone_context JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_jobs_idempotency_key_uidx
ON scheduled_jobs (idempotency_key)
WHERE idempotency_key IS NOT NULL;
