# ⚔️ Socratic Interrogation Recipe: Grill-Me & Grill-With-Docs

This recipe governs the Socratic planning and assumption-testing protocol executed by the **@analyst** and **@architect** agents before writing any code.

---

## 🎯 Core Directive: Relentless Interrogation Before Implementation

> **Constitutional Rule:** Never write production code based on ambiguous or unverified specifications. Always interrogate the developer, stress-test architectural decisions, and verify compliance against `.atabey/knowledge/` corporate standards.

---

## 📋 The 5 Grilling Axes

When a user or @manager proposes a new feature, module, or refactoring task, the agent must run through these 5 interrogation axes:

### Axis 1: Need & Scope Elimination (Occam's Razor)
- *"What specific problem does this solve for the end user or system?"*
- *"Can this problem be solved without writing new code (e.g., re-using existing services, database query, configuration)?"*
- *"What is the minimal viable surface area? What are the non-goals that we must explicitly reject?"*

### Axis 2: Constitutional Compliance (Atabey Rulebook Audit)
Audit the proposed plan against the 37+ standards in `.atabey/knowledge/`:
- **Database (`crud-governance.md`, `kysely-standards.md`):** Does any business logic touch controllers directly? Is raw SQL avoided in favor of typed Kysely schemas?
- **Type Safety (`ATABEY.md`):** Are branded types (`OrderId`, `UserId`) planned? Is `any` completely forbidden?
- **Testing (`testing-standards.md`, `vitest-standards.md`):** Can this be tested end-to-end with real SQLite/PostgreSQL instances without relying on fake mocks?
- **Secrets & Logging (`logging-and-secrets.md`, `pino-standards.md`):** Are API keys or secrets avoided in configuration? Is `EnterpriseLogger` planned instead of `console.log`?

### Axis 3: Edge Cases, Failure Modes & Resilience
- *"What happens if the external service times out, returns HTTP 500, or sends malformed payloads?"*
- *"How does the system behave when concurrent requests attempt to mutate the same resource simultaneously?"*
- *"If the process crashes halfway through this operation, what state is left behind? Is a compensation transaction or rollback planned?"*

### Axis 4: Data Modeling & API Contracts
- *"What are the exact Zod request/response validation schemas?"*
- *"Are database migrations forward- and backward-compatible (zero-downtime schema migrations)?"*
- *"Will this change break existing mobile or frontend API contracts? Does it require updating `contract.version.json`?"*

### Axis 5: Risk & Governance Assessment
- Check against the Atabey Risk Engine:
  - Does this operation involve database schema drops, mass file edits, auth logic changes, or dependency installations?
  - Will the calculated Risk Score exceed **60** (triggering Human-in-the-Loop approval)?

---

## 🔄 Interaction Loop: Socratic Dialogue Protocol

1. **Ask Focused, Numbered Questions:**
   Present 2-4 incisive questions at a time. Highlight risks and trade-offs.
2. **Challenge Weak Assumptions:**
   If the developer suggests a shortcut that violates Atabey standards (e.g., *"let's mock this for now"* or *"we'll add types later"*), explicitly flag the violation and offer a compliant alternative.
3. **Formal Resolution:**
   Continue grilling until every branch of ambiguity is resolved and recorded.
4. **Transition Gate:**
   Once all questions are answered, transition immediately to `spec-generation-recipe.md` to produce `SPEC-<ID>.md`.
