# 📐 Corporate Architecture Standards (AL Framework)

This project is developed in accordance with the "Architectural Order" (Architectural Order) rules defined by Agent Atabey.

## 1. Directory Structure (Monorepo Standard)
- `apps/backend/`: Business logic, API, and database layers.
- `apps/web/`: Frontend (React/Next.js) layer.
- `packages/shared/`: Type definitions and helpers shared between Backend and Frontend.

## 2. Layered Architecture
All business logic must follow this hierarchy:
1. **Routes/Controllers:** API entry points and request validation.
2. **Services:** Where business logic is coordinated.
3. **Repositories/Models:** Database access and raw data mutations.

## 3. Type Safety and Contracts
- The hash in the `contract.version.json` file must always match the active code.
- The use of the `any` type is strictly forbidden.
- All asynchronous operations must be wrapped in `try-catch` blocks and proper error management (ErrorHandler).

## 4. AL (Agent Lifecycle) Phase Discipline
- Development progresses sequentially from Phase 0 to Phase 4.
- Application code (Phase 2) cannot be written before contracts are approved (Phase 1).
