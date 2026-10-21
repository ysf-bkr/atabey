# 🧪 Disposable Prototype & Spike Recipe: prototype

This recipe governs the rapid exploration and proof-of-concept (PoC) protocol executed by the **@architect**, **@explorer**, and **@backend** agents.

---

## 🎯 Core Directive: Prototype Quarantine Protocol

> **Constitutional Rule:** Prototype code is throwaway code. Prototype code must be developed in strict quarantine (isolated git branch or sandbox worktree) and is strictly forbidden from being merged into production without formal specifications, contract-first design, and a full TDD test suite.

---

## 🔬 The 4-Phase Spiking Protocol

### Phase 1: Explicit Quarantine Setup
- **Branch Naming:** Create an isolated spike branch: `git checkout -b spike/<feature-name>`.
- **Sandbox Workspace:** If using worktrees, isolate in `.atabey/worktrees/spike/`.
- **Header Banner:** Every file created during a spike must begin with:
  ```typescript
  /**
   * [DISPOSABLE PROTOTYPE]
   * This file is an experimental spike. NOT FOR PRODUCTION USE.
   * Must be discarded or formally specified before merging.
   */
  ```

### Phase 2: Rapid Hypothesis Testing
- Test feasibility, library compatibility, or latency limits quickly.
- Mocking and exploratory shortcuts are permitted *only* within the spike branch.
- Log performance and interface trade-offs using `EnterpriseLogger`.

### Phase 3: The Graduation Gate (Spike to Production)
When a prototype proves viable, **do NOT merge the spike directly**. Instead:
1. Extract architectural findings into `atabey grill <topic>`.
2. Generate a formal specification via `atabey spec init` / `to-spec`.
3. Create atomic implementation tickets via `atabey to-tickets`.
4. Re-implement cleanly on a clean feature branch following strict TDD (Red-Green-Refactor) with zero mocks in integration tests.

### Phase 4: Teardown & Quarantine Cleanup
- Delete the spike branch or remove the worktree via `atabey worktree remove spike`.
- Document key conclusions in `.atabey/memory/PROJECT_MEMORY.md`.
