# Storage SSOT Consolidation Plan

> **Status:** Analysis complete (2026-10-13). Implementation deferred — this is a
> 36-file, ~1370-line refactor that touches DB initialization across every agent
> and tool. It must be done as a dedicated, test-guarded change, not bundled with
> feature work.

## Problem

The codebase contains **three** storage locations, violating Atabey's own
Single Source of Truth (SSOT) principle:

| File | Lines | Methods | DB owner |
|------|-------|---------|----------|
| `packages/shared/src/database.ts` | 24 | `databaseHolder` (getDB/setDB) | Shared — injected |
| `packages/atabey/src/shared/storage.ts` | 557 | 55 | Uses `atabey-shared` `databaseHolder` |
| `packages/atabey-mcp/src/shared/storage.ts` | 812 | 86 | Opens its **own** `better-sqlite3` connection |

- **53 methods are shared** between the two `AtabeyStorage` classes.
- `packages/atabey` (20 importers) and `packages/atabey-mcp` (16 importers) each
  run their own `AtabeyStorage`, each opening its own SQLite connection to
  `atabey.db`.
- `getFrameworkDir()` is imported from two different places
  (`../cli/utils/memory.js` vs `../mcp/utils/memory.js`).

## Why it matters

- **Two DB connections to the same file** → lock contention, WAL race conditions,
  and potential data divergence between the CLI and the MCP server.
- Divergent copies drift over time; a bug fixed in one is not fixed in the other.
- Board/lint rules assert SSOT; the framework violates its own constitution.

## Constraints (must preserve)

1. `packages/shared` must stay dependency-light — it cannot import
   `getFrameworkDir` (that lives in `atabey`/`atabey-mcp`). The DB path must be
   injected, not resolved inside shared.
2. The larger `atabey-mcp` `AtabeyStorage` (86 methods) is the **superset** — it
   has 33 methods the `atabey` one lacks. Consolidating must not drop them.
3. `databaseHolder` (dependency injection) is the right pattern; the MCP variant's
   self-owned connection should be migrated to it.

## Proposed target architecture

```
packages/shared/src/database.ts       → databaseHolder (DI) — already correct
packages/shared/src/storage.ts        → AtabeyStorage (canonical, 86-method superset)
                                          + resolveDbPath() params passed by caller
packages/atabey/src/shared/storage.ts → re-export from "atabey-shared/storage.js"
packages/atabey-mcp/src/shared/storage.ts → re-export from "atabey-shared/storage.js"
```

Both packages call `databaseHolder.setDB(db)` once at startup with the same
path (`.atabey/atabey.db`), and `AtabeyStorage` reads via `databaseHolder.getDB()`.

## Step-by-step (each step = one green test run)

1. **Move** the 86-method `AtabeyStorage` from
   `packages/atabey-mcp/src/shared/storage.ts` into
   `packages/shared/src/storage.ts`.
   - Remove `getFrameworkDir`/`maskText`/`logger`/`types` package-local imports;
     inject the DB path and accept logger/pii from shared.
   - Add `"exports": { "./storage.js": "./dist/storage.js" }` to
     `atabey-shared/package.json`.
2. **Build `atabey-shared`**, then in `packages/atabey/src/shared/storage.ts`
   replace the body with `export * from "atabey-shared/storage.js";` (mirroring the
   existing `shared/pii.ts` → `atabey-shared/pii.js` pattern). Run
   `npm test -w packages/atabey` → must stay green.
3. Same for `packages/atabey-mcp/src/shared/storage.ts`. Run
   `npm test -w packages/atabey-mcp` → must stay green.
4. **Unify DB init:** make both packages resolve the SAME DB path and call
   `databaseHolder.setDB()` exactly once. Verify the runtime smoke test still passes
   (one server, one connection).
5. **Delete** the duplicate implementations, run the full suite + `atabey check`.

## Risk & guard

- Guard rail: the existing runtime smoke test (`runtime-smoke.test.ts`) proves the
  MCP server boots with resolved exports. Re-run it after each step.
- If any step turns a test red, stop — the consolidation is wrong for that step.

## Decision

**Deferred to a dedicated PR.** Consolidation is high-value (fixes a real
DB-double-open bug) but high-churn. Do it when there is budget for a focused
refactor with full test coverage, not as a side effect of feature work.
