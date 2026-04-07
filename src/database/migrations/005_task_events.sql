CREATE TABLE IF NOT EXISTS task_events (
  id BIGSERIAL PRIMARY KEY,
  task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS task_events_task_id_idx ON task_events (task_id, created_at DESC);
