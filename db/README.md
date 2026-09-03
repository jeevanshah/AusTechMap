# Database

Versioned PostgreSQL migrations will live here. Schema work is deliberately deferred until the
remaining Phase 0 contracts for job scheduling, G-NAF operations, backups, retention, and account
deletion are approved.

The target database is Neon PostgreSQL with the `postgis` and `pg_trgm` extensions.
