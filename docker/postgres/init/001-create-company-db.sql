CREATE ROLE company_reader WITH LOGIN PASSWORD 'company_reader';
CREATE DATABASE company_prod OWNER postgres;
GRANT CONNECT ON DATABASE company_prod TO company_reader;
