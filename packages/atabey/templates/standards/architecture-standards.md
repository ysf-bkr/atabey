# 📐 Corporate Architecture Standards (AL Framework)

This project is developed in accordance with the "Architectural Order" (Architectural Order) rules defined by Atabey.

## 1. Directory Structure (Monorepo Standard)
- `apps/backend/`: Business logic, API, and database layers.
- `apps/web/`: Frontend (React/Next.js) layer.
- `packages/shared/`: Type definitions and helpers shared between Backend and Frontend.

## 2. Layered Architecture
All business logic must follow this hierarchy:
1. **Routes:** API endpoint routing, rate limiting, and middleware registration.
2. **Controllers:** Request validation (Zod/class-validator), DTO parsing, and HTTP status handling.
3. **Services:** Core business logic orchestration, domain rules, and background job dispatching.
4. **Repositories/Models:** Database access, schema models, and transactional mutations.
5. **Job Workers:** Asynchronous background processing backed by database queue persistence.

## 3. Type Safety and Contracts
- The hash in the `contract.version.json` file must always match the active code.
- The use of the `any` type is strictly forbidden.
- All asynchronous operations must be wrapped in `try-catch` blocks and proper error management (ErrorHandler).

## 4. AL (Agent Lifecycle) Phase Discipline
- Development progresses sequentially from Phase 0 to Phase 4.
- Application code (Phase 2) cannot be written before contracts are approved (Phase 1).

## 5. Deep Module Design & Anti-Pattern Prevention (Ousterhout & Fowler Principles)
- **Deep Modules:** Design modules that provide a simple interface to powerful, complex functionality. Avoid "shallow modules" that merely forward calls.
- **Information Hiding:** Internal representations, third-party libraries, and database drivers must never leak into public domain signatures.
- **Anti-Pattern Catalog:**
  - *God Object / Brain Class:* Prohibited. A single class or service must not control the majority of system operations.
  - *Leaky Abstraction:* Prohibited. Domain interfaces must not expose SQL, HTTP, or transport-specific artifacts.
  - *Feature Envy:* Prohibited. Modules must not excessively operate on data belonging to external modules.
  - *Temporal Coupling:* Prohibited. Method invocations should not depend on undocumented execution order.

## 6. Formal Specification Standard (to-spec)
- In Phase 1, all architectural decisions must be recorded in `docs/specs/SPEC-<ID>.md` following `spec-generation-recipe.md`.
- No task may enter the PlanningEngine without verified acceptance criteria and typed Zod schemas.
