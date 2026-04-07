CREATE TABLE IF NOT EXISTS debug_records (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT,
  task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
  message_external_id TEXT,
  scheduler_job_id BIGINT REFERENCES scheduled_jobs(id) ON DELETE SET NULL,
  tool_name TEXT,
  severity TEXT NOT NULL,
  stage TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS debug_records_created_at_idx ON debug_records (created_at DESC);
CREATE INDEX IF NOT EXISTS debug_records_task_id_idx ON debug_records (task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS debug_records_run_id_idx ON debug_records (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS debug_records_message_external_id_idx ON debug_records (message_external_id, created_at DESC);
CREATE INDEX IF NOT EXISTS debug_records_stage_idx ON debug_records (stage, created_at DESC);
