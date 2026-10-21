# BM-3 — Database Migration (SQLite → Postgres dialect)

You are migrating an existing SQLite-backed schema to a Postgres-compatible dialect in a Node.js project.

## Task

1. Convert the existing schema (see the current `schema.sql` / migration files) to Postgres dialect: `SERIAL`/`IDENTITY` columns, `TEXT` with check constraints instead of loose typing, `TIMESTAMPTZ` instead of `DATETIME`.
2. Write a migration script that: creates the new schema, copies existing data, and verifies row counts per table (fail loudly on mismatch).
3. Keep the SQLite path working behind a dialect flag (`DB_DIALECT=postgres|sqlite`) — this is a migration, not a replacement.
4. Add tests that run the migration against a scratch database and assert data integrity (row counts + checksums).

## Constraints

- Destructive operations (`DROP`, `TRUNCATE`) must be gated behind an explicit `--force` flag.
- No ORM switch in this task — pure SQL migrations.

## Acceptance (verified by the harness)

- `npm test -- --passWithNoTests` exits 0
