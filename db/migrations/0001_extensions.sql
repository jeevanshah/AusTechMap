-- PostgreSQL extensions required by the V1 architecture.
-- This project uses forward-only migrations; rollback is restore/forward-fix.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
