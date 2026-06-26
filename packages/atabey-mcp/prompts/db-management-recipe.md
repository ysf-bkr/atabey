# [DB] Engineering Recipe: Database Management & Migrations

This recipe governs the @database agent's protocol for schema creation, table modifications, and data integrity.

## 📐 Phase 1: Contract-First Definition
1.  **Type Mapping:** Define the new table or column in `src/types/models.ts` using Branded Types for IDs.
2.  **Validation:** Ensure the interface extends `BaseEntity` (id, createdAt, updatedAt).

## [START] Phase 2: Migration Generation
1.  **Scripting:** Write a reversible migration (up/down) using the project's migration tool (e.g., Kysely or SQL).
2.  **Atomic Changes:** One migration per logical feature. Never bundle unrelated schema changes.
3.  **Naming:** Use timestamp-prefixed naming (e.g., `20240101_add_customers_table.ts`).

## 🧱 Phase 3: Infrastructure Setup (If New DB)
1.  **Initialization:** Verify the connection string in `.env`.
2.  **Health Check:** Run `check_active_ports` to ensure the DB engine is reachable.

## 🛠️ Phase 4: Implementation & Repository Update
1.  **Repo Layer:** Create or update the Repository class to include the new query logic.
2.  **Strict Mode:** Ensure no raw SQL is used; leverage the query builder exclusively.

## [OK] Phase 5: Verification & Zero-Downtime Audit
1.  **Dry Run:** If supported, dry-run the migration to check for locking issues.
2.  **Validation:** Run `atabey verify-contract` to ensure code and schema are synced.
3.  **Handoff:** Update `PROJECT_MEMORY.md` with the new schema version.
