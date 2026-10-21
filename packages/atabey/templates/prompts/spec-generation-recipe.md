# 📑 Specification Generation Recipe: to-spec

This recipe defines how the **@architect** and **@analyst** agents convert conversational alignment and Socratic grilling results into a formal, binding specification (`docs/specs/SPEC-<ID>.md`).

---

## 🎯 Core Directive: The Single Source of Truth

> **Constitutional Rule:** An implementation task without a formal specification is forbidden in Phase 1. The specification is the single source of truth for the PlanningEngine, the implementation agents (@backend, @frontend), and the Quality Gate review.

---

## 📐 Specification Document Template

Every generated specification must follow this standardized Markdown schema:

```markdown
# [SPEC-###] <Feature or Subsystem Title>

**Trace ID:** <TRACE_ID>  
**Author Agent:** @architect  
**Date:** <YYYY-MM-DD>  
**Status:** DRAFT | APPROVED | IMPLEMENTED  
**Calculated Risk Score:** <0-100>  

---

## 1. Executive Summary & Problem Statement
- **Context:** Brief background explaining why this feature is needed.
- **Problem:** Exact problem, friction, or capability gap being addressed.
- **Proposed Solution:** High-level architectural approach.
- **Non-Goals:** What this specification explicitly does NOT cover (scope boundary).

---

## 2. User Stories & Acceptance Criteria (Gherkin Format)
- **Story 1:**
  - *As a* <role>
  - *I want to* <action>
  - *So that* <business value>
  - **Scenario (Acceptance Criteria):**
    - **Given** <precondition>
    - **When** <trigger action>
    - **Then** <expected verifiable outcome>

---

## 3. Data Models & Type Contracts
Define complete, unambiguous TypeScript interfaces and Zod validation schemas:

\`\`\`typescript
import { z } from "zod";

// Zod Schema for runtime input validation
export const CreateFeatureSchema = z.object({
  name: z.string().min(1).max(100),
  tenantId: z.string().uuid(),
}).strict();

export type CreateFeatureInput = z.infer<typeof CreateFeatureSchema>;
\`\`\`

- **Branded IDs:** State any branded types to add to `src/types/brands.ts`.
- **Database Tables:** Specify exact Kysely table interfaces and migration requirements.

---

## 4. API Endpoints & Interfaces
| Method | Path | Request Body | Response Body | Status Codes | Auth / RBAC |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/resource` | `CreateFeatureSchema` | `ResourceResponse` | `201`, `400`, `401`, `409` | `admin:write` |

- **Error Envelopes:** Standard Atabey error response `{ success: false, error: { code, message, details } }`.

---

## 5. Security, PII & Governance Mandates
- **PII Masking:** Identify any fields containing PII (email, phone, IP) that must be masked before logging.
- **Access Control:** Define required roles and permissions.
- **Risk Triggers:** Specify if this operation triggers HITL approval (score >= 60).

---

## 6. Execution Dependency Graph (to-tickets Pre-Check)
Decompose the implementation into atomic subtasks:
1. `TASK_01`: Database migration & Kysely model updates (@database)
2. `TASK_02`: Core domain service & repository implementation (@backend) [Depends on: TASK_01]
3. `TASK_03`: Integration test suite with real SQLite/PostgreSQL (@backend) [Depends on: TASK_02]
4. `TASK_04`: UI atomic components and query hooks (@frontend) [Depends on: TASK_01]
5. `TASK_05`: Quality Gate dual-axis review and security audit (@quality, @security) [Depends on: TASK_03, TASK_04]
```

---

## 🚦 Verification Gate

Before submitting the specification:
1. Verify that **zero** `any` types appear in the contract.
2. Verify that every task in the dependency graph has at least one verifiable acceptance criterion.
3. Commit the specification to `docs/specs/SPEC-<ID>.md`.
