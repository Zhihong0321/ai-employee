CREATE TABLE IF NOT EXISTS llm_call_logs (
  id BIGSERIAL PRIMARY KEY,
  provider_name TEXT NOT NULL,
  model TEXT NOT NULL,
  call_type TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  input_cost_per_token_myr NUMERIC(20,12),
  output_cost_per_token_myr NUMERIC(20,12),
  input_cost_myr NUMERIC(20,12),
  output_cost_myr NUMERIC(20,12),
  total_cost_myr NUMERIC(20,12),
  latency_ms INTEGER,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS llm_call_logs_created_at_idx ON llm_call_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS llm_call_logs_provider_model_idx ON llm_call_logs (provider_name, model, created_at DESC);
