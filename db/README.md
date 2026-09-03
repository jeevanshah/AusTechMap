# Database

Versioned PostgreSQL migrations will live here. The Phase 0 contracts for job scheduling, G-NAF
operations, backups, retention, authentication, and account deletion are now closed in
`ARCHITECTURE_DECISIONS.md` §4; implementing them is the next Phase 1 database slice.

The target database is Neon PostgreSQL with the `postgis` and `pg_trgm` extensions.
