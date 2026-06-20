# [GOV] Corporate CRUD and Governance Standards

This document defines the strict rules applicable to data mutation and administrative operations in projects managed by the Agent Atabey AL.

## 1. High-Risk Operations
The following operations are considered "High-Risk" and cannot be performed autonomously by specialist agents (@backend, @database, etc.):
- Database schema changes (DDL).
- Bulk data deletion or purging (Bulk Delete/Purge).
- User authorization and role assignment systems.
- Payment system (Billing) integrations.
- PII (Personal Data) export.

## 2. Approval Flow
- When a specialist agent receives a high-risk operation request, they must reject the operation and report the status to `@manager`.
- `@manager` analyzes the request and creates a task awaiting `managerApproval`.
- The operation is held until a human overseer (Human-in-the-Loop) grants approval via the `atabey approve [TraceID]` command.

## 3. Data Discipline
- **Branded Types:** All IDs (UserID, OrderID, etc.) must strictly follow the branded types format.
- **Kysely Only:** Raw SQL queries are forbidden. Only the type-safe Kysely query builder may be used.
- **Repository Pattern:** Database operations cannot be performed directly within controllers; they must pass through the service and repository layers.
