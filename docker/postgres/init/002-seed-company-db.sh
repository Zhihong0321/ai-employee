#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "company_prod" <<'EOSQL'
CREATE TABLE IF NOT EXISTS branch_directory (
  id BIGSERIAL PRIMARY KEY,
  branch_code TEXT NOT NULL UNIQUE,
  branch_name TEXT NOT NULL,
  manager_name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO branch_directory (branch_code, branch_name, manager_name)
VALUES
  ('HQ', 'Headquarters', 'Local Test Manager'),
  ('SRB', 'Seremban', 'Branch Lead Demo')
ON CONFLICT (branch_code) DO NOTHING;

GRANT USAGE ON SCHEMA public TO company_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO company_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO company_reader;
EOSQL
