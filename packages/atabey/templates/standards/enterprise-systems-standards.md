# Enterprise Systems Standards

> Corporate architectural standards for Multi-Tenancy, Migrations, Background Queues, Caching, RBAC, and GDPR/KVKK compliance.

## 1. Multi-Tenancy Architecture
- **Tenant Isolation:** Every multi-tenant database table must include a non-nullable `tenant_id` foreign key with indexed compound queries (`INDEX (tenant_id, id)`).
- **Row-Level Security (RLS) / Scoped Querying:** Repositories must enforce tenant context via AsyncLocalStorage or request-scoped dependency injection. Never write un-scoped queries.

## 2. Database Migration & Rollback Strategy
- **Two-Phase Deployments (Expand & Contract):**
  1. *Phase 1 (Expand):* Add new nullable columns or tables. Deploy application code reading both old and new schemas.
  2. *Phase 2 (Contract):* Backfill data, apply NOT NULL constraints, drop old deprecated columns in a separate release.
- **Reversibility:** Every migration file must provide both `up()` and `down()` rollback functions.
- **Lock Minimization:** Avoid `ALTER TABLE` operations that acquire exclusive table locks in production; use concurrent indexing where supported.

## 3. Background Jobs & Job Queues
- **Mandatory Database Persistence:** All background jobs, asynchronous queues, and workers MUST persist their lifecycle in the database (e.g., `jobs` / `background_tasks` table). Volatile, in-memory-only queues are strictly prohibited for business workflows.
- **Transactional Enqueueing:** Enqueueing jobs must be committed within the same database transaction as the business operation to eliminate dual-write hazards.
- **Status State Machine:** Jobs must transition through explicit database statuses: `PENDING` -> `PROCESSING` -> `COMPLETED` / `FAILED` / `DEAD_LETTER`.
- **Idempotency:** All job handlers must be idempotent. Use `idempotency_key` or message deduplication hashes.
- **Retry & Dead-Letter Queues (DLQ):** Failed jobs must record attempt count, last error trace, and use exponential backoff with jitter (max 5 retries) before being routed to a dead-letter queue.
- **Graceful Shutdown:** Workers must listen to `SIGTERM` / `SIGINT` signals, stop accepting new jobs, and allow in-flight tasks up to 30 seconds to finish.


## 4. Caching & Cache Invalidation
- **Cache-Aside Pattern:** Query cache first; on miss, query database, populate cache with TTL, and return.
- **Strict TTLs:** Never set infinite cache lifespans. Default TTL: 5 minutes for dynamic entities, 1 hour for static reference data.
- **Event-Driven Invalidation:** Invalidate specific keys on entity mutations (`users:{id}`, `tenant:{id}:settings`). Avoid wildcards (`KEYS *`) in production.

## 5. Permission-Based Authorization (RBAC / ABAC)
- **Granular Permissions:** Check specific permissions (`users:write`, `reports:export`) rather than coarse roles (`ADMIN`).
- **Fail-Closed:** Unauthenticated or unauthorized requests must be rejected immediately before controller execution.

## 6. Data Retention & Privacy (GDPR / KVKK)
- **Soft Delete:** Entities subject to regulatory compliance must use soft delete (`deleted_at TIMESTAMP NULL`). Hard delete must only occur through scheduled data retention purge jobs.
- **Right to Be Forgotten:** Implement cryptographic shredding or automated data scrubbing pipelines to anonymize user PII across primary and backup storage upon request.
- **Audit Trail:** Maintain immutable audit logs of all privileged access and configuration modifications using the Atabey cryptographic audit chain.
