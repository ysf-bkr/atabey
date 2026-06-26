# [SECURITY] Corporate Security and Data Protection Standards

This document defines the security protocols and data protection standards for projects managed by Agent Atabey.

## 1. Database Security (RLS)
- **Row Level Security (RLS):** All user data must be protected with RLS policies. A user cannot access another user's data except through a permission protocol approved by `@manager`.
- **SQL Injection:** Raw SQL queries are strictly forbidden (Kysely mandatory).
- **Encryption at Rest:** Sensitive data (PII) must be stored encrypted in the database.

## 2. Authentication and Authorization
- **JWT / Session:** Only secure authentication methods approved by the `@security` agent are used.
- **Role Based Access Control (RBAC):** Authorization schemes must be managed centrally under `apps/backend/src/security/roles.ts`.

## 3. API Security
- **CORS:** Only allowed domains can access the API.
- **Rate Limiting:** Rate limiting must be applied for all API endpoints.
- **Input Validation:** All inputs (request body, params) must be strictly validated with Zod or a similar library.

## 4. Secret Management
- **No Hardcoded Secrets:** API keys, passwords, or secret keys can never be stored in the code.
- **.env Discipline:** All secret variables must be managed via the `.env` file, and this file must never be pushed to git.
