# Changelog — Atabey

All notable changes to this project are documented in this file.

---

## [0.0.38] — 2026-10-17 — 4-Pillar Control Plane, Autonomous Runtime & Security Hardening

### Planning
- **Agent Runtime plan (§4).** A step-by-step roadmap (P0–P4, 23 tasks) to turn the "13 agents" from role templates into real autonomous workers. Driver model: orchestrate **headless AI CLIs** (no embedded LLM SDK). Distributed queue/lock: **Hermes WSS Bus** reusing the existing `ws` + `tls.ts` stack — **Redis/NATS explicitly rejected** to keep the dependency footprint at zero.

### Agent Runtime (P0.1–P0.5)
- **New `AgentAdapter` + `HeadlessCliAdapter`** (`packages/atabey/src/modules/runtime/adapters/`): drives non-interactive CLI invocations (`claude`/`gemini`/`codex`/`aider`/`ollama`) with `shell:false`, hard timeout + SIGKILL, and output capping. Presets are overridable; `buildCommand()` exposes the resolved argv.
- **New `AgentRuntime.runTurn()`** (`modules/runtime/agent-runtime.ts`): resolves the backing CLI (option → `ATABEY_AGENT_CLI` → `ATABEY_CLI_<AGENT>` → default `claude`), runs one turn, and returns a report with real cl100k input/output token accounting. Never throws.
- **Worktree isolation (P0.4):** `modules/runtime/worktree.ts` — `ensureAgentWorktree()` creates/reuses a real `git worktree` under `.atabey/worktrees/<agent>`; falls back to the main tree (or fails closed when required) for non-git projects. Enabled via `ATABEY_AGENT_WORKTREE` or `worktree: true`.
- **Sandbox routing (P0.4):** when `sandbox: true` / `ATABEY_AGENT_SANDBOX`, the CLI is spawned through `runInSandbox` (`shared/src/sandbox-runtime.ts`) — **fail-closed** if isolation is required but unavailable.
- **QualityGate + OTel (P0.5):** optional `qualityGate` runs `QualityGate.check` on the turn output (fails the turn on violation); every turn emits an OTel span (`agent.turn <agent>`) with isolation/sandbox/token attributes.
- **`AgentExecutor.executeForAgent` now really executes** — opt-in via `ATABEY_AGENT_RUNTIME=true`: it drives `AgentRuntime.runTurn`, writes the `RESPONSE` + status + audit log. When disabled (default), the legacy host-AI ack is preserved (no behaviour change).
- **Tests:** +21 unit tests (`tests/modules/runtime/headless-cli.test.ts`) — echo, non-zero exit, timeout, output cap, worktree isolation (real git repo), sandbox fail-closed, graceful errors. Plus **+9 `dispatcher.test.ts`** tests (parallel waves, cycle detection, per-agent serialization, dependency order/failure, token budget, token aggregation). 663 tests total.
- **P1 DAG Dispatcher:** `modules/runtime/dispatcher.ts` — parallel execution with a counting `Semaphore`, Kahn-wave dependency ordering, per-agent serialization (shared-worktree safety), and a per-agent token ceiling. Now covered by tests and no longer an orphan file.
- **Evidence bundles + collision check (P1.3 / Faz A.2):** `modules/runtime/evidence.ts` — every executed task yields a tamper-evident bundle (`changedFiles`, `diffStat`, token spend, quality result, SHA-256 `contentHash` + keyed HMAC `signature`) with `buildEvidenceBundle` / `verifyEvidenceBundle` / `formatEvidenceBundle`. `worktree.ts` adds `collectWorktreeChanges` and `detectCollisions`; the dispatcher reports `conflicts` (files touched by >1 agent) and `evidence[]`. CLI wiring (`plan.ts` → `AgentDispatcher` under `ATABEY_AGENT_RUNTIME`) added.
- **Tests:** +9 `dispatcher.test.ts` + **+7 `evidence.test.ts`** (signed bundle, tamper detection, collision detection, real-git worktree change collection). 671 tests total.
- **Code Graph (Faz B.1):** `modules/memory/code-graph.ts` — incremental symbol/file/import index in SQLite (migration **v6**: `code_files`, `code_symbols`, `code_imports`). Content-hash compare skips unchanged files; deleted files are pruned. Exposes `CodeGraph.index/find/stats/clear`; wired into `atabey index`. +9 `code-graph.test.ts` tests (extraction, incremental re-index, removal, symbol search). 676 tests total.
- **Context Assembler (Faz B.2 — flagship):** `modules/memory/context-assembler.ts` — turns a task description into a small, targeted bundle by querying the CodeGraph and reading **only the matched symbol line ranges**, instead of scanning the repo. Reports `bundleTokens` vs `fullFilesTokens` and a `savingsPercent`. Exposes `ContextAssembler.assemble` + `formatContextBundle` + `extractKeywords`. +5 `context-assembler.test.ts` tests. 681 tests total.
- **Context injection into the runtime (B.2 integration):** `AgentRuntime.runTurn` gains a `context` option (`ATABEY_AGENT_CONTEXT`) that assembles a bundle for the task and prepends it to the prompt ("do not re-scan the repo"); the dispatcher forwards `context`. +2 `context-injection.test.ts` tests. 683 tests total.
- **`get_task_context` MCP tool (40th tool):** exposes `ContextAssembler` to the host AI so Claude/Cursor/etc. can fetch a targeted bundle instead of scanning the repo. Added to coding/readonly profiles; docs synced 39 → 40.
- **Signed audit export (Faz C.2):** `modules/audit/export.ts` — HMAC-SHA256 signed JSON/CSV of the audit trail (`buildAuditExport`/`verifyAuditExport`/`auditExportToJson`/`auditExportToCsv`); CLI `atabey audit export`; API `GET /api/audit/export`. +3 tests.
- **FinOps per-agent budgets + webhook (Faz C.1):** `FinOpsManager.setAgentBudget/setMonthlyBudget/getAgentBudgets/setWebhookUrl/notifyBudgetWebhook/checkAndNotifyBudgets` (fires each threshold once/month); API `GET|POST /api/finops/config`; dashboard **`AgentBudgetPanel`** (per-agent $ ceilings + webhook URL editor) added to the FinOps page. +4 tests; i18n 294 → 306 keys (TR/EN parity).
- **Hermes WSS Bus (Faz D.1):** `mcp/utils/wss-bus.ts` — dependency-light WebSocket hub with server-authoritative distributed locks, stale-timeout sweeper, token auth, and frame routing; attached to the unified server at `/bus`. +4 tests.
- **Self-host packaging (Faz D.2):** `Dockerfile`, `docker-compose.yml`, `docs/self-host.md` — one-command deployment of unified MCP + dashboard + WSS Bus. 694 tests total.

### Cleanup (sadeleştirme)
- **Removed redundant `view_file` MCP tool** — it was a byte-for-byte alias of `read_file`. All agent/skill tool mappings (Claude, Gemini, Codex) and docs now point to `read_file`.
- **Removed peripheral `compress_files` / `decompress_files` MCP tools** — not part of the governance core and dependent on host `zip`/`tar` binaries (cross-platform liability). Archiving, when genuinely needed, goes through `run_shell_command`.
- **Tool surface reduced 42 → 39.** Counts synchronized across root/package READMEs, `BLINDSPOTS.md`, `ROADMAP.md`, and the runtime smoke-test assertion message.
- **Removed dead special-case code** in the permission matrix for the deleted archive tools.
- **Doc consistency fixes:** reconciled OIDC status (`enterprise-roadmap` 2.2 → Done), worktree pre-commit status (`ROADMAP`/`TASKS`), duplicate `Git Worktree İzolasyonu` task, and bumped `knip.json` schema from `knip@5` → `knip@6`.
- **Stale-doc corrections:** marked the Storage SSOT consolidation (`storage-ssot-plan.md`, BLINDSPOTS) as **implemented** (both package storages are already 2-line re-exports), refreshed BLINDSPOTS §8 (real AST scanner exists) and §17 (removed already-completed items from the future-work list).
- **Repo hygiene:** untracked committed runtime state (`packages/*/.atabey/*.db`, `-shm`, `-wal`, audit anchors) and **123 stale auto-rollback test snapshots** (`packages/atabey-mcp/.atabey/rollbacks/*.bak`). The `.gitignore` runtime-artifact patterns are now recursive (`**/.atabey/...`) so package-level `.atabey/` state no longer pollutes the tree.

### Multi-platform adapter cleanup (P0–P4)
- **Fixed a broken tool reference:** agents (esp. `@quality`) and the routing engine told the model to run `check_compliance` — a tool that **does not exist**. Repointed to the real `check_architecture_compliance` in `agents/registry/quality.ts`, `agents/definitions.ts` (`TOOL_KEYS` + Claude/Gemini maps) and `engines/routing-engine.ts`.
- **Removed dead `AdapterConfig` fields:** `shimTemplate` (pointed at a non-existent `src/cli/shims/*.md`), `templateDir` (never read), and `role` (+ `AdapterRole` type, never read).
- **Removed dead export** `getCursorGlobalRulePaths()`.
- **Removed 3 dead functions** from `adapter-skills.ts` (`filterToolsForAdapter`, `getSkillsForAgent`, `mapToolToPlatform` — only present in generated `.d.ts`): 578 → 503 lines. `ADAPTER_SKILLS` kept (feeds `/api/adapters/skills`).
- **Single source of truth for `FRAMEWORK_DIR_CANDIDATES`:** deleted the dead duplicate in `cli/platforms/core.ts`; `atabey-mcp` now imports the constant from `atabey-shared/constants.js` instead of a local copy; duplicate entries in the shared list de-duplicated.
- Details & the deferred P3/P5/P6 refactor blueprint: `docs/internal/platform-adapters-refactor.md`.

### Token economy / discipline (single source of truth)
- **Unified token estimation:** `context-optimizer.estimateTokens()` now delegates to the shared approximate cl100k tokenizer (`atabey-shared/tokenizer.ts`) instead of a crude `chars / charsPerToken` heuristic. Budget checks, smart truncation, and FinOps now report the **same** numbers (previously three different estimators could disagree).
- **Removed ~235 lines of dead context-window code:** `addContextBlock`, `getContextStats`, `compressContext`, `persistSession`, `restoreSession` and the `ContextSession`/`ContextBlock` state had **zero callers** — the context-window manager never populated a session, so its "90% context" warning could never fire. The live parts (`checkTokenBudget`, `smartTruncateFile`, `detectProvider`, budget stats) are retained. `context-optimizer.ts`: 521 → 313 lines.
- **Real tokenizer:** `countTokens` now uses the real `cl100k_base` BPE table via `js-tiktoken` (lite + cl100k ranks, ~±2% accuracy) with the old heuristic as an automatic fallback. Added `js-tiktoken` dependency; `atabey-mcp` tsconfig moved to `moduleResolution: bundler`.
- **Token budget hard enforcement (opt-in):** `ATABEY_TOKEN_BUDGET_ENFORCE=true` adds a pre-execution rate/token gate and refuses to deliver over-budget payloads to the model (previously advisory only, and it never blocked non-`read_file` tools).
- **"Grep-before-read" discipline (opt-in):** `ATABEY_DISCIPLINE_ENFORCE_READ=true` blocks a blind full-file `read_file` (>`MCP_READ_DISCIPLINE_LINES`, default 400) unless a `grep_search` ran within `MCP_GREP_RECENCY_MS` (default 5 min) or a line range was given.
- **Restart-durable discipline history:** new SQLite migration **v5** (`discipline_calls` table + index) plus `recordDisciplineCall`/`getRecentDisciplineCalls`/`pruneDisciplineCalls`/`clearDisciplineCalls` storage APIs. Per-agent call history now survives MCP restarts (rate/loop windows no longer reset).

### Dead file analysis (v0.0.38)
- **Deleted 5 confirmed-dead files** (zero imports anywhere, verified repo-wide): `packages/atabey-mcp/src/mcp/utils/errors.ts` (a 75-line duplicate of `packages/shared/src/errors.ts`), and the unused 1-line re-export shims `packages/atabey-mcp/src/shared/{errors,fs,lock,string}.ts`.
- **Confirmed clean:** `knip --include files,dependencies` reports no unused files/deps; `dist/` and `coverage/` are **not** tracked.
- **Flagged (not removed):** `packages/atabey/src/modules/contracts/api.ts` is referenced only by its own test (possible public export); `templates/standards/*.md` (31) largely duplicate `.atabey/knowledge/*.md` (30 of 31 identical); `mcp.json` == `.mcp.json`; root shim `*.md` duplicate `cli/shims.ts`.
- **Verified intentional (NOT deletable):** `mcp.json` is required by `atabey check`; `.mcp.json` is the Claude Code / Copilot convention written by the claude+codex adapters; `templates/standards/` is shipped source (`files` in package.json) consumed by `scaffoldStandards`/`scaffoldAgents`; `contracts/api.ts` is a public export (`./src/*`).
- **Disk artifacts purged:** removed untracked `coverage/` trees (~7.5 MB) and all `.DS_Store`; hardened `scripts/clean.mjs` to also remove coverage output + `.DS_Store`.
- **Drift fixed:** `templates/standards/typeorm-standards.md` (newer) was copied into `.atabey/knowledge/typeorm-standards.md` — the two standards copies are now fully in sync.
- **Shipped the 3 missing standards:** `dashboard-ui-standards.md`, `eslint-standards.md`, `token-economy.md` were added to `packages/atabey/templates/standards/` and wired into `scaffoldStandards` (the inline ESLint block was removed in favour of the template). Also wired the previously-unreferenced `reporting-standards.md` and `enterprise-systems-standards.md`. `templates/standards/` and `scaffoldStandards` now reference the **same 34 files**, and `templates/standards` ⇄ `.atabey/knowledge` are the same set with identical content.
- **Quality gate:** 642 tests / 99 files pass, 0 lint warnings, knip clean, `npm audit` 0 vulnerabilities.

### Security (fail-closed)
- **Governance pipeline is now fail-closed**: if the policy gate, rule engine, discipline engine, CRUD governance, or risk gate errors, the tool call is **denied** instead of silently passing (`middleware/governance.ts`).
- **Audit chain upgraded to keyed HMAC-SHA256** with the key stored outside the DB (`.atabey/audit-hmac.key` / `ATABEY_AUDIT_HMAC_KEY`) plus an out-of-DB tip anchor for truncation detection (`audit-chain.ts`, `audit.ts`, `storage.ts`, `retention.ts`). Chain payloads are now length-delimited (no `|` boundary ambiguity).
- **Shell allow-list hardened**: `find -delete/-exec/-ok/-fprint` predicates blocked; path-like args confined to the project root via `safePath`; `run_tests` now runs via `execFileSync` with a token-based allow-list (no shell).
- **SSRF hardened**: decimal/octal/hex IP encodings and DNS names resolving to private/link-local/metadata addresses are blocked; IPv6 loopback respected.
- **Sandbox runtime**: container runs as the host UID with `--cap-drop=ALL`, `no-new-privileges`, network `none` by default, and `-i` so container-mediated writes no longer produce empty files. `sandbox-fs` now rejects symlink escapes.
- **Approval flow**: `approve_operation` MCP schema accepts `passcode`; the unauthenticated HTTP approve/reject bypass is removed (RBAC + stderr passcode enforced; dashboard prompts for the passcode). Dashboard static serving blocks path traversal and API auth fails closed.
- **Policy gate coverage** expanded (`http_proxy_request`, `run_tests`, `orchestrate_loop`, `approve_operation`, locks, etc.) and protected-path patterns extended (`.git/hooks`, `.docker`, `.kube`, `*.pem/key/crt`).
- **File lock** create is now atomic-with-content (removes the empty-file steal race); **worker pool** timeout recycles the stuck worker; **erasure** now clears cost/knowledge/users/approvals/discipline/locks.
- **PII masking** tightened: TCKN checksum validation, IPv4 octet validation, IPv6 vs clock-time disambiguation, AMEX exact length, Bearer char set, single-quoted password fields; `strictMode` now functional.
- **TLS 1.3 + mTLS transport security** (`packages/shared/src/tls.ts`): a single HTTP(S) factory now backs the unified MCP server, dashboard, and WebSocket feed. `ATABEY_TLS_MIN_VERSION` defaults to `TLSv1.3`; `ATABEY_MTLS_REQUIRED=true` + `ATABEY_TLS_CA_FILE` enforce client certs; `ATABEY_TLS_REQUIRED=true` fails closed and plaintext binds to non-loopback hosts are rejected unless `ATABEY_ALLOW_INSECURE_BIND=true`. WebSocket upgrades now verify an auth token (`?token=`) or client cert.
- **Sandbox required by default in production/enterprise** (`resolveDefaultSandboxRequired` in `sandbox-runtime.ts`): `NODE_ENV=production` or `ATABEY_PROFILE=enterprise` hard-require isolation; local development stays usable (with a one-time warning) and can force it via `ATABEY_SANDBOX_REQUIRED=true`. Child-process environments are scrubbed of credentials via `scrubEnvForSubprocess`.
- **Package manager & build RCE surface closed in `run_command`**: `npm/yarn/pnpm install|ci` automatically enforce `--ignore-scripts` and block script-enabling flags (`--foreground-scripts`, `--nodedir`, etc.); `npm/yarn/pnpm run <script>` is restricted to a safe script allow-list (`build`, `test`, `lint`, `typecheck`, `check`, `format`, `verify`, `compile`, `clean`, `coverage`) when unsandboxed; arbitrary native build/run commands (`make`, `cmake`, `./gradlew`, `mvn`, `dotnet run`, `go run`) require active sandbox isolation or `ATABEY_ALLOW_UNSANDBOXED_SCRIPTS=true`.
- **Universal Permission Matrix & supreme-tier critical path protection**: `enforceToolPermissionMatrix` now runs centrally in `middleware/governance.ts` across all read/write/archive/analysis tools; `@manager` and `@security` obey explicit rules in `permission-matrix.json` and are universally blocked from overwriting critical governance/key files (`.env*`, `.git/hooks/*`, `.atabey/permission-matrix.json`, `.atabey/audit-hmac.key`, `.atabey/master.key`, `.atabey/secrets.vault.json`, `*.pem`, `*.key`).
- **AES-256-GCM Secret Management & Leak Guard** (`packages/shared/src/secrets.ts`, `atabey secrets`): local encrypted vault (`.atabey/secrets.vault.json`) with per-secret HKDF-SHA256 salts, key rotation, subprocess environment scrubbing, and secret-pattern leak scanning.
- **cl100k BPE Tokenizer & Multi-Provider FinOps Catalog** (`packages/shared/src/tokenizer.ts`, `utils/metrics.ts`, `middleware/governance.ts`): deterministic `cl100k_base`/`o200k_base` pre-tokenization + subword decomposition, distinct input/output token accounting, and per-model USD pricing (`MODEL_PRICING_CATALOG`).
- **SQLite Schema Migrations, Startup Integrity Check & Online Backup/Restore** (`packages/shared/src/migrations.ts`, `storage.ts`, `atabey db`): versioned `schema_migrations` table with SHA-256 checksum verification, startup `PRAGMA quick_check`/`integrity_check`, and atomic `VACUUM INTO` backups with `.sha256` sidecars.

### Documentation (honesty)
- `README.md`: fixed broken BLINDSPOTS links, 7→11 skills, tool-count header, standards table (removed non-existent `token-economy`), platform sandbox column now states it is env-driven, `@manager + 12 specialists`.
- `PRIVACY.md`: corrected masking formats to actual output and removed non-existent commands.
- `docs/internal/BLINDSPOTS.md`: re-scoped sandbox (§1), policy engine (§3), FinOps (§6), state durability & migrations (§7); added keyed-audit-chain note; version 0.0.32→0.0.37; test counts corrected.
- Package READMEs: versions `0.0.23`→`0.0.37`, real 9-engine list, 11 skills, 39 tool definitions, `MCP_TRANSPORT=unified`.
- `SECURITY.md`, `ROADMAP.md`, `AGENTS.md`, `.env.example` corrected; `atabey contract update`, `atabey db`, and `atabey secrets` registered.

### Fixed
- `atabey mcp start/status` now resolve the MCP entry via the package root (was silently falling back to `npx`).
- Dashboard version no longer hardcoded (`0.0.6`).
- `parseUrl` no longer drops query values containing `=`; `uncaughtException` exits non-zero.
- Client tool profiles are enforced on `CallTool`, not just `ListTools`.

### Added
- Governance emits a `SECRET_LEAK_DETECTED` audit event (and WS alert) when credentials are found in tool output.
- `atabey secrets set` reads the value from piped stdin when omitted (keeps secrets out of shell history).
- New tests: `tokenizer.test.ts`, `secrets.test.ts`, `migrations.test.ts`, `tls.test.ts`, `api-catalog.test.ts`, `read_file_cache.test.ts`, `get_symbol_outline.test.ts`, `ast-scan.test.ts`, `agent-identity.test.ts`, `memory-prune.test.ts`, `otel.test.ts`, `headless-approval.test.ts` (now **646 tests / 99 files**).

### Added — Real AST, Agent Identity, Memory Hygiene, OTel, Worktrees (batch 3)
- **Real AST engine** (`ast-scan.ts`): TypeScript Compiler API detects `any` (incl. generics), `console.*`, `debugger`, and ts-ignore directives — no more regex false positives on comments; wired into the rules engine (pre-write validation too).
- **Cryptographic agent identity** (`agent-identity.ts`): HMAC-signed `ATABEY_AGENT_TOKEN`; `resolveActiveAgent` verifies (fail-closed); `ATABEY_AGENT_IDENTITY_REQUIRED=true` rejects plain-env identity.
- **Specialty memory hygiene** (`memory-prune.ts`): dedup + cap + prune marker on the agent learning files.
- **OpenTelemetry** (`otel.ts`): W3C traceparent + OTLP-shaped JSONL spans per MCP tool call (`.atabey/telemetry/otel.jsonl`), optional OTLP/HTTP export.
- **Git worktree isolation**: `atabey worktree create|list|remove` keeps experimental agent work off the live tree.
- **Legacy dashboard cleanup**: removed unused `AtabeyDashboard.tsx` and `pages/index.ts`.

### Added — OIDC / SSO & Project Rename (batch 4)
- **OIDC / JWT verification** (`oidc.ts`, wired into `auth.ts`): HS256 (shared secret) and RS256/ES256 (JWKS) bearer-token validation with `exp`/`nbf`/`iss`/`aud` checks and fail-closed behavior; JWKS cached and primed at startup. Config: `ATABEY_OIDC_JWKS_URL`, `ATABEY_OIDC_ISSUER`, `ATABEY_OIDC_AUDIENCE`, `ATABEY_OIDC_HS_SECRET`.
- **Project renamed**: "Agent Atabey" → **Atabey** everywhere (docs, templates, CLI strings, dashboard, `.atabey/` knowledge base, User-Agent). The product is simply **Atabey**.

### Added — Token Economy, Resilience & Governance (batch 2)
- **`read_file` file-hash guard**: repeated full reads of an unchanged file return a compact `[CACHE HIT]` notice (bypass with `force:true`) — token savings.
- **`get_symbol_outline`** MCP tool: AST-lite symbol map (functions/classes/interfaces/types + line ranges) so an agent can locate a symbol without reading the whole file.
- **Atomic multi-file rollback**: a batch write with any violation now restores EVERY file it touched (no half-changed project).
- **Circuit breaker / non-interactive execution**: `run_shell_command` and `run_tests` force `CI=true`, `DEBIAN_FRONTEND=noninteractive`, `GIT_TERMINAL_PROMPT=0`, etc., and scrub secrets from the child env.
- **Context-aware PII masking**: masking of tool *results* is skipped for tests/docs/examples/fixtures (`shouldBypassPiiMaskingForPath`), preventing corruption of technical content.
- **Transitive license scan**: `audit_dependencies` now walks `package-lock.json` and flags strong/weak copyleft in the full dependency tree.
- **Headless CI approval** (`human-in-loop.ts`): when `CI=true` or `ATABEY_HEADLESS_APPROVAL=true`, the risk gate applies a deterministic policy (`ATABEY_HEADLESS_APPROVAL_MODE=allow|deny`, `ATABEY_HEADLESS_MAX_RISK`) instead of blocking on a human prompt — non-interactive pipelines no longer hang.

### Added — API Catalog & Contract Drift
- **API endpoint registry** (`packages/shared/src/api-catalog.ts`, migration v4 `api_endpoints`) with a heuristic scanner for Express/Fastify/NestJS routes and OpenAPI v3 / Swagger v2 specs.
- **`get_api_catalog`** MCP tool: compact endpoint list (method, path, tag, schemas) so frontend/mobile agents integrate without reading route files.
- **`inspect_endpoint`** MCP tool: full contract + starter request payload for one endpoint.
- **`atabey api scan|list|drift|json`** CLI + mirror at `.atabey/contracts/api-registry.json`.
- **Drift detection** (`detectApiDrift`) surfaced by `atabey api drift` and `atabey contract verify` (added/removed/changed endpoints).
- In-memory SQLite (`:memory:`) audit chain anchors are stored in memory instead of writing `audit-chain-structured.anchor.json` into CWD.

---

## [0.0.37] — 2026-10-15

### Fixed
- **Type Safety (`tsc --noEmit`)**: Resolved `TS2741` schema disparity in `ReplaceTextSchema` and `BatchSurgicalEditSchema` (`allowMultiple` made optional). Monorepo passes with 0 type errors.
- **Strict Typing in Dashboard**: Completely removed `@ts-nocheck` and lint ignores from `packages/atabey/src/cli/commands/dashboard.ts` (877 lines), achieving 100% strict TypeScript compliance.
- **Runtime Smoke Test Latency**: Accelerated `runtime-smoke.test.ts` from 20 seconds to 362ms (55x speedup) by correctly handling JSON-RPC notifications.
- **Recursive Test Execution**: Guarded nested `npx tsc`, `npx eslint`, and `npx vitest` subprocesses in `EvaluationEngine` during test runs (`isTestEnv`), cutting test suite execution time by 50%.
- **Secure Authentication Standards**: Removed insecure static fallback secrets (`change-me-in-production`) in `auth-standards.md`, mandating strict environment-variable enforcement.
- **Cross-Platform Compatibility**: Replaced POSIX `rm -rf` in clean scripts with universal `scripts/clean.mjs` (`fs.rmSync`). Added `.gitattributes` for LF normalization.
- **Root Monorepo Cleanup**: Removed redundant production `dependencies` and workspace self-dependencies from root `package.json`. Knip passes with 0 dependency violations.

### Added
- **CI Multi-OS Matrix & Verification**: Added `npx tsc --noEmit` and cross-platform matrix (`ubuntu-latest`, `macos-latest`, `windows-latest`) to GitHub Actions CI workflow. Added automated open-source license scanning (`license-checker`).
- **Automated Pre-commit Hook**: Installed native `.githooks/pre-commit` hook enforcing type safety (`tsc --noEmit`) and linting (`eslint`) before every local commit.
- **Core Skills Expansion**: Expanded `CORE_SKILLS` from 7 to 11 skills to cover `@security` (`SECURITY_AUDIT`), `@frontend` (`FRONTEND_DEVELOPMENT`), `@mobile`/`@native` (`MOBILE_DEVELOPMENT`), and `@git` (`GIT_WORKFLOW`).
- **Enterprise & Reporting Standards**: Added comprehensive standards for analytical aggregation, streaming CSV/PDF exports (`reporting-standards.md`), and corporate architecture (`enterprise-systems-standards.md` covering multi-tenancy, zero-downtime migrations, queue idempotency, and GDPR data retention).
- **Automated Release Workflow**: Added `.github/workflows/release.yml` with CycloneDX SBOM generation and npm provenance.
- **Coverage Thresholds**: Configured coverage threshold policies for `packages/shared` and `packages/atabey`.

## [0.0.36] — 2026-10-15
- Baseline monorepo alignment.

### Changed
- **`better-sqlite3` → v13**: Upgraded from `^12.10.1` to `^13.0.2` (N-API). Prebuilt binaries ship inside the package; the deprecated `prebuild-install` dependency is gone, and there is no install lifecycle script — so npm `allow-scripts` / `prebuild-install` deprecation warnings no longer appear on clean installs.
- **Node engine**: Raised to `>=22.0.0` (required by `better-sqlite3@13`). CI matrix is now Node 22.x / 24.x.
- **Version Bump**: All packages updated to v0.0.32.

## [0.0.31] — 2026-08-01

### Fixed
- **CRITICAL — Missing runtime `typescript`**: Restored `typescript` as a production dependency of `atabey` and `atabey-mcp`. The compliance AST scanner (`cli/utils/compliance.ts` / MCP utils) imports the TypeScript compiler API at runtime; keeping it in `devDependencies` caused `ERR_MODULE_NOT_FOUND` on global/npx installs (`Cannot find package 'typescript'`).

### Changed
- **Version Bump**: All packages updated to v0.0.31.

## [0.0.30] — 2026-08-01

### Changed
- **Version Bump**: All packages updated to v0.0.30 (`atabey`, `atabey-mcp`, `atabey-shared`, monorepo, dashboard).
- **Internal Dependency Ranges**: Aligned workspace and package dependency ranges to `^0.0.30` so `0.0.x` caret installs resolve the correct patch.
- **Lockfile Refresh**: Regenerated `package-lock.json` so workspace packages resolve local `atabey-shared@0.0.30` instead of a stale nested registry copy.

### Fixed
- **Stale Root Metadata**: Root `package.json` `atabey.version` metadata updated to `0.0.30` (was left at `0.0.27` after earlier bumps).

## [0.0.25] — 2026-07-12

### Added
- **New CLI Commands**: Added `compliance`, `contract`, `knowledge`, `log`, and `script` CLI commands to `COMMANDS` registry in `cli/index.ts`.
- **ESLint Config Ignores**: Added `packages/atabey/src/**/*.js`, `*.d.ts`, `*.js.map` and `packages/atabey-mcp/src/**/*.js`, `*.d.ts`, `*.js.map` patterns to prevent linting compiled artifacts.

### Fixed
- **Compiled Artifacts in Source**: Removed ~100+ compiled `.js`/`.d.ts`/`.js.map` files from `packages/atabey/src/` and `packages/atabey-mcp/src/` that were committed alongside TypeScript sources. These are now in `.gitignore` and `eslint ignores`.
- **`build:dashboard` Script**: Fixed workspace path syntax — changed `"npm run build -w packages/atabey-mcp dashboard"` to `"npm run build -w packages/atabey-mcp/dashboard"`.
- **`atabey-mcp` Package Exports**: Removed source path aliases (`./src/mcp/utils/*`, `./src/shared/*`) from `exports` — only dist paths remain.
- **`typescript` in Production Dependencies**: Moved `typescript` from `dependencies` to `devDependencies` in both `packages/atabey` and `packages/atabey-mcp`.
- **`tsconfig.json` — `atabey`**: Added `rootDir`, fixed cross-package `paths`, excluded `dashboard.ts` type checking (uses runtime dynamic imports from `atabey-mcp`).
- **`tsconfig.json` — `atabey-mcp`**: Changed `moduleResolution` from `"node"` to `"bundler"`, added `rootDir`, removed cross-package `atabey/*` path mappings.
- **`cli/index.ts` Redundant Aliases**: Removed self-referencing `"coverage": "coverage"` and `"quickstart": "quickstart"` aliases.
- **Dashboard Version Alignment**: Updated `@atabey/dashboard-ui` from `0.0.23` to `0.0.24` (now 0.0.25).

### Changed
- **Localization Cleanup**: Removed Turkish character patterns from `RoutingEngine.tokenize()` and `CoreMemory.generateEmbedding()` regex for ASCII-only tokenization. Updated `scaffold-docs.ts` regex to match English template headings.
- **Version Bump**: All packages updated to v0.0.25.

## [0.0.24] — 2026-07-02

### Fixed
- **NPM Installation Failure (CRITICAL)**: Moved `atabey-shared` and all runtime dependencies from `peerDependencies` to `dependencies` in both `packages/atabey` and `packages/atabey-mcp`. Previously, npm would not automatically install `atabey-shared`, causing `ERR_MODULE_NOT_FOUND` on `npx atabey-mcp`.
- **MCP Server CLI Path Resolution**: Fixed `bin/cli.js` candidate path order — now correctly searches `dist/atabey-mcp/src/mcp/index.js` first, with `dist/mcp/index.js` as fallback.
- **Dashboard UI Path Resolution**: Replaced static `__dirname`-based path with a dynamic `resolveDashboardPath()` function that searches multiple candidate locations (monorepo dev, npm global install, npm local install, project root).

### Changed
- **Version Bump**: All packages updated to v0.0.24 (`atabey`, `atabey-mcp`, `atabey-shared`, monorepo).
- **Package Dependency Model**: `packages/atabey` and `packages/atabey-mcp` now have `@modelcontextprotocol/sdk`, `better-sqlite3`, `chalk`, `js-yaml`, `ws`, `zod` as direct `dependencies` instead of `peerDependencies`, ensuring npm/yarn auto-install them.

### Improved
- **Dashboard Discovery**: Added npm global and local install path candidates to dashboard resolution, making `atabey-mcp` work correctly when installed via `npm install -g atabey-mcp` or `npm install atabey-mcp`.

## [0.0.23] — 2026-07-02

### Fixed
- **Missing CLI Dependencies**: Moved `typescript` from devDependencies to dependencies in `atabey` and `atabey-mcp` to resolve `ERR_MODULE_NOT_FOUND` on execution via `npx`.
- **Legacy Framework References**: Replaced old `framework-mcp` folder paths in the rulebooks (`ATABEY.md`, `ATABEY_FULL.md`) and indexing commands with the correct package names (`atabey-mcp`).

### Improved
- **Compliance Terminology**: Softened absolute KVKK/GDPR compliance claims in documentation to focus on technical alignment controls.
- **Agent Model Transparency**: Added execution details to `README.md` clarifying that the 13 specialized agent contexts are dynamic roles assumed sequentially by the host AI assistant.

## [0.0.22] — 2026-07-02

### Fixed
- **Circular Package Dependencies**: Removed mutual `atabey` ↔ `atabey-mcp` dependencies in published packages. Both now depend only on `atabey-shared` to eliminate npm resolution issues.
- **Leaky Exports**: Tightened `exports` maps:
  - Removed `./src/*` and duplicate src aliases from `atabey` and `atabey-mcp`.
  - Replaced wildcard `./*` + `./*.js` in `atabey-shared` with explicit module exports for better encapsulation and tree-shaking.
- **Documentation Inaccuracies**: Standardized to "13 specialized agents". Updated all "13-layer governance pipeline" marketing claims to accurate "multi-layer governance pipeline" descriptions matching the actual implemented pre/post checks (PII mask, validation, discipline, loop detection, FinOps, CRUD governance, risk gate, etc.).
- **Missing package metadata**: Added `"sideEffects": false` to all three published packages.

### Changed
- All package versions and internal dependency pins bumped to 0.0.22.
- Version badges and dashboard UI strings updated to v0.0.22.

---

## [0.0.19] — 2026-06-27

### Fixed
- **RegExp Stateful `lastIndex` Bug** (`packages/shared/pii.ts`): Fixed RegExp `lastIndex` status leakage in `containsPII` by resetting `lastIndex = 0` before and after testing, preventing false negatives on consecutive pattern matches.
- **Lock Concurrency Race Condition** (`packages/shared/lock.ts`): Replaced check-then-act (SELECT then INSERT) pattern with SQLite atomic `INSERT OR IGNORE` in `DistributedLock.acquire`, preventing concurrency crashes and unique constraint violations under load.
- **Monorepo Cross-Package Imports**: Fixed broken relative path imports (`../cli/...` and `../../modules/...`) in `packages/atabey-mcp` referencing `packages/atabey` package. Replaced relative paths with standard `atabey/src/*` path mappings to enable successful `tsc` type checking and compilation.
- **Linter Console Warnings** (`packages/atabey-mcp/src/mcp/utils/web-config.ts`): Replaced forbidden `console.error` calls with standard `process.stderr.write` to satisfy ESLint `no-console` policy.

### Changed
- Package versions bumped to 0.0.19 across all workspaces.
- Cleaned up redundant `.atabey` runtime state files from subdirectories and corrupt database backups.

---

## [0.0.18] — 2026-06-26

### Added
- **Package-level README.md**: Comprehensive documentation for both `atabey` (15 engines, 14 agents, 7 skills, 30+ standards) and `atabey-mcp` (32 tools, 13-layer governance pipeline, dashboard, security features).
- **Storage & Auth enhancements**: Added missing methods to `AtabeyStorage` — `hasUsers()`, `getUsers()`, `getUserByToken()`, `createUser()`, `deleteUser()`, `createAgent()`, `deleteAgent()`, `updateAgentDetails()`, `getKnowledgeList()`, `getKnowledgeFile()`, `saveKnowledgeFile()`, `deleteKnowledgeFile()`, `onMessageSaved`, `onMessageStatusUpdated`.
- **Quality.ts inline implementation**: Removed circular cross-package dependency, implemented `analyzePathQuality()` directly in `atabey` package.
- **README.md Rewrite**: Added 5 Core Capabilities, 7 platform support table, 14 agents, 32 tools, 7 skills, 3-layer memory, 30+ standards, 13-layer governance pipeline, KVKK/GDPR matrix, 12 new badge indicators.

### Changed
- Package versions: atabey → 0.0.18, atabey-mcp → 0.0.18
- tsconfig.json: strict mode disabled for build compatibility
- Legacy migration artifacts cleaned up

---

## [0.0.17] — 2026-06-26

### Added
- **README.md Comprehensive Rewrite**: Added 5 Core Capabilities Overview table (Tools, Memory, Agents, Skills, Knowledge Base) with scoring. Added Supported Platforms section (7 platforms with MCP mode, tools, skills details). Added 32 MCP Tools categorized listing. Added 7 Core Skills table with platform adaptation. Added 3-Layer Memory System with flow diagram. Added Knowledge Base (30+ Standards) by category. Added 13-Layer Governance Pipeline detailed breakdown. Added KVKK/GDPR Compliance matrix. Added 12 new badge indicators (MCP Tools, Agents, Platforms, Skills, Governance Score, Orchestration Score).

### Enhancements
- **Specialty Memory Success Learning** (`src/modules/engines/evaluation-engine.ts`): `updateSpecialtyMemory()` now also saves success lessons via `extractSuccessLesson()` when score >= 80. Agents now learn from both failures AND successes.
- **Specialty Memory Auto-Injection** (`src/modules/engines/agent-executor.ts`): `readLearnedConventions()` is now called during agent execution and injected via `buildSilentContext()` in silent-router.ts. Agent lessons are automatically available in next session.
- **Package versions**: atabey → 0.0.17, atabey-mcp → 0.0.17

---

## [0.0.16] — 2026-06-21

### Added
- **Prompt Injection Detection** (`framework-mcp/src/utils/discipline.ts`): Added `PROMPT_INJECTION_PATTERNS` array (13 patterns) and `scanForPromptInjection()` helper to `validateResponse()`. Catches adversarial payloads such as "Ignore previous instructions", persona overrides, LLM template tokens (`[INST]`, `<<SYS>>`), jailbreak phrases, and system-prompt injection attempts embedded in file content or API responses. Violations are blocked with a descriptive label before reaching the AI.
- **Semantic Routing** (`src/modules/engines/routing-engine.ts`): Added `resolveWithEmbeddings()` async method and `cosineSimilarity()` helper. Connects the existing `CoreMemory.generateEmbedding()` (TF-IDF, 384-dim) and `embedding.ts` (OpenAI text-embedding-3-small when `OPENAI_API_KEY` is set) infrastructure to the RoutingEngine. Blends TF-IDF (60%) with cosine similarity (40%) for higher routing accuracy. Falls back gracefully to pure TF-IDF if embedding fails. Also extracted `scoreSingleCandidate()` private helper to eliminate duplication.
- **SAST via CodeQL** (`.github/workflows/ci.yml`): New `sast` job runs GitHub CodeQL with `security-and-quality` query suite on every push/PR. Covers JavaScript/TypeScript.
- **Secret Scanning via Gitleaks** (`.github/workflows/ci.yml`): New `security-scan` job runs `gitleaks/gitleaks-action@v2` over full git history to detect leaked API keys, tokens, and credentials. `build-and-test` job now depends on `security-scan` passing.
- **Coverage Upload Artifact** (`.github/workflows/ci.yml`): `build-and-test` now uploads `coverage/` as an artifact on Node 22.x runs for inspection without downloading locally.

### Fixed
- **`agent-executor.ts` — Runtime Crash** (`src/modules/engines/agent-executor.ts`): `pollForAgentResponse()` referenced `maskedResponse` before it was defined, causing a `ReferenceError` every time an agent responded. Fixed by adding `const maskedResponse = maskText(response.content)` before the `saveLog` call. Return value also updated to `maskedResponse` for KVKK/GDPR consistency.
- **`quality-gate.ts` — False Positive Rejections** (`src/modules/engines/quality-gate.ts`): Error indicator check used `.includes()` which incorrectly rejected valid TypeScript code containing identifiers like `ErrorBoundary`, `handleError`, `TIMEOUT_MS`, `FAILED_VALIDATION`. Changed to word-boundary regex (`\bERROR\b`, etc.) to match only standalone error words.

### Changed
- **`RiskEngine` — Contextual Behavioral Scoring** (`src/modules/engines/risk-engine.ts`): Added 3 new behavioral signal categories alongside keyword/path analysis: (1) `BULK_SCOPE_PATTERNS` — glob/wildcard patterns in task text or file paths score +25; (2) mass-deletion language ("delete all", "wipe") scores +30; (3) `assessChangeRisk()` now accepts optional `affectedFileCount` and `deletedLineCount` parameters — high file counts (>3 files: +15, >10 files: +40) and bulk line deletions (>100: +20, >500: +35) are factored into risk score.
- **Coverage Thresholds** (`vitest.config.ts`): Raised from blanket 40% to lines/functions/statements: 70%, branches: 60%. Added phased roadmap comment toward the 100% framework-mcp goal.

---

## [0.0.15] — 2026-06-20

### Added
- **`approve_operation` MCP Tool** (`framework-mcp/src/tools/messaging/approve_operation.ts`): New in-chat approval tool for risk-gated operations. When a high-risk operation is blocked (score ≥ 60), the AI is instructed to call `approve_operation` with `action: "approve" | "reject" | "list"` and `traceId`. Eliminates the need to switch to a terminal to run `atabey approve <traceId>`.
- **`ask_human` File Bridge** (`framework-mcp/src/tools/messaging/ask_human.ts`): Rewrote ask_human from readline-based (non-functional in stdio MCP subprocess) to a file-based Q&A bridge. Questions are written to `.atabey/hitl/question.txt`, answers are read from `.atabey/hitl/answer.txt`. Developers answer via `atabey hitl answer "..."` or the dashboard.
- **`atabey hitl answer` CLI command**: Terminal-side bridge for answering pending ask_human questions without interrupting the AI CLI chat.

### Fixed
- **`discipline.ts`**: Removed `run_shell_command` and `check_active_ports` from the default `RESTRICTED_TOOLS` list. `run_shell_command` already has its own security via `COMMAND_ALLOW_LIST` (npm, git, go, pytest, etc.) and metacharacter injection protection. AI can now run `npm test`, `npm install`, `git commit` etc. without manual environment variable overrides. Override still possible via `MCP_RESTRICTED_TOOLS`.
- **`telemetry-streamer.ts`**: Replaced `require("os")` with top-level `import os from "os"` — ESM compatibility fix that was causing a runtime crash in Node.js (package is `"type": "module"`).
- **`telemetry-streamer.ts`**: `new WebSocket()` now checks for native WebSocket availability (Node.js ≥ 22 only). Falls back gracefully to HTTPS batch mode on Node.js 18/20 instead of throwing a `ReferenceError`.
- **`human-in-loop.ts`**: Replaced `agent as any` and `"@manager" as any` type casts with `asAgentID()` branded type helper — Zero Type Hole policy compliance.
- **`human-in-loop.ts`**: Updated risk gate blocked operation message to instruct AI to call `approve_operation` MCP tool instead of asking developer to type `atabey approve <traceId>` in chat (which AI CLI treats as chat text, not a terminal command).
- **README.md**: Corrected SSE port from `5859` → `5858` (default port is 5858 per `index.ts`). Port 5859 was documented but never the actual default.
- **README.md**: Updated `MCP_RESTRICTED_TOOLS` documentation — `run_shell_command` is no longer restricted by default.
- **README.md**: Replaced outdated "Blind Spots" roadmap section with "Implemented Governance Features" table — all 4 critical features (Token Budget, Silent Routing, HITL, Auto-Rollback) are now implemented.
- **README.md**: Version badge updated to v0.0.15, MCP Tools badge updated to 35 (added `approve_operation`), test badge corrected to 266 (was showing 322 which was incorrect).

### Changed
- Version: 0.0.14 → 0.0.15
- `AskHumanSchema`: Added optional `timeoutSeconds` field (default: 120s) for configurable polling duration.
- `ApproveOperationSchema`: New schema with `action` (approve|reject|list), optional `traceId` and `reason`.
- Risk gate error message format: Now includes MCP tool call instructions instead of terminal command suggestions.

---

## [0.0.14] — 2026-06-19


### Added
- **`AgentLoop`** (`src/modules/engines/agent-loop.ts`): Real agent task polling loop. Agents now process Hermes DELEGATION messages and forward them to the execution handler to manage status and messaging.
- **`AgentExecutor.executeForAgent()`**: Task acknowledgment and messaging method. Loads the agent's definition and writes a RESPONSE message back to Hermes to signal that execution is delegated to the AI client interface.
- **Memory Auto-Learning Loop** (`src/modules/engines/evaluation-engine.ts`): Implemented `learnFromTask` in `EvaluationEngine`. Analyzes successfully completed agent tasks, extracts actionable coding guidelines, and appends them to the agent's specialty markdown file (`.atabey/memory/specialties/<agentName>.md`). The agent automatically reads and follows these conventions on subsequent runs.
- **Cost Persistence SQLite Support**: Added a `costs` database table and schema support to SQLite, enabling persistence of budget configurations and cost logs. Tracking remains accurate across CLI exits and daemon restarts.
- Real TF-IDF with genuine IDF component in `RoutingEngine` (was keyword counting only).

### Fixed
- **`QualityGate`**: Selective file-level lint (`npx eslint <filePath>`) instead of full-project `npm run lint` on every agent output. Eliminates circular recursion risk and false negatives.
- **`QualityGate`**: Removed test execution from quality gate (moved to CI pipeline). Gate now focuses on output quality, not full regression.
- **`QualityGate`**: Added TypeScript `any` type detection in `validateOutputContent()` — Zero Type Hole policy enforced at output level.
- **`RoutingEngine`**: Implemented real IDF scoring: `IDF = log(N / df + 1)` where `N` = total agents, `df` = agents sharing the term. Terms unique to few agents now score higher.
- **`AgentExecutor`**: Reduced polling timeout from 30s to 10s.
- **Duplicate code** (`src/cli/index.ts`): Extracted `getActiveTraceId()` helper — eliminates 4× copy-paste of the same memory-reading pattern.
- **Unit Test State Leakage**: Isolated all DB-driven test files (`cost-tracker.test.ts`, `hermes_locking.test.ts`) using isolated temporary directories (`process.env.ATABEY_TEST_DIR`), ensuring a 100% green test run.

### Changed
- Version: 0.0.13 → 0.0.14
- Integrated compliance checks into the core agent lifecycle logs.

---


## [0.0.13] - 2026-06-17

### Added
- **Coverage command:** `atabey coverage` — Test coverage reports
- **Declarations file:** `framework-mcp/src/declarations.d.ts` for MCP type safety
- **`check:lint` command:** ESLint execution via CLI
- **Project size profile documentation:** Small, Medium, Enterprise configuration tables added to README

### Changed
- **MCP tool naming:** `read_file`/`view_file` separated (both map to ReadFile handler)
- **`init` command restructured:** Clean interactive flow, `--unified` / `--yes` support, platform selection
- **`quickstart` command:** Content updated to better reflect actual use cases
- **Memolock (DistributedLock):** Switched from Git-based mechanism to robust file-based system. Lock files stored in `.atabey/messages/`
- **`execute_code` tool removed:** Security-critical decision; removed from all tool definitions
- **Provider IDs:** Renamed per third-party developer guidelines:
  - `antigravity` → `antigravity-cli`
  - `grok` → `groq`
  - `local` → `ollama`
- **Dashboard:** React 19 + Vite 7 -> downgraded to React 18 + Vite 6 for MCP dashboard compatibility
- **Package lowered to 0.0.x:** Earlier releases mistakenly versioned as 0.9.x; corrected from this release forward
- **Provider definitions:** OpenAI, Anthropic, Google, Groq, Ollama provider definitions added
- **Test structure:** Tests reorganized and augmented. 223 tests passing

### Fixed
- **Lock mechanism:** `process.exit()` race condition fixed — lock files now properly released on shutdown
- **MCP tool descriptions:** Character overflow in Claude Code agent definitions fixed
- **`stdin` error in test pipes:** Interactive approval prompts disabled during test execution

### Removed
- **`execute_code` removed:** Replaced with `run_shell_command` (restricted, audited)
- **Alibaba / DeepSeek provider stubs removed**

---

## [0.0.12] - 2025-06-02

### Added
- **68 MCP tool definitions for all 5 platforms** (Claude, Gemini, Cursor, Codex, Antigravity)
- **Quality Gate integration** — AST-based compliance, ESLint, unit test retry loop
- **Hermes Message Broker v2** — Priority queue, dependency graph, approval mechanism
- **Cost economy and tracking v1** — Persisted token and expense metrics
- **Dashboard v1** — Real-time WebSocket with 8 live modules
- **`plan:submit` command:** JSON-based DAG workflow execution
- **13-specialist agent registry** — Structured, extensible, tier-based (Supreme/Core/Recon)
- **KVKK/GDPR compliance** — PII masking, data retention policies, right to erasure
- **Enterprise logger** — 5-level structured JSON logging with PII masking

### Changed
- **Agent Definition schema rewritten** — Branded types, strict frontmatter separation
- **Memory system upgraded** — TF-IDF v2 with cosine similarity search
- **CLI reorganized** — 30+ commands with consistent `@agent` delegation syntax
- **Security hardening** — Path traversal prevention, SQL injection protection, prompt injection mitigations

### Fixed
- **Memory lock race conditions** — File-based locking with TTL expiration
- **Agent executor timeout handling** — 30-minute timeout with state recovery
- **Cross-platform frontmatter compatibility** — Separate exporters for Claude, Gemini, Cursor, Codex, Antigravity

---

## [0.0.11] - 2025-05-15

### Added
- **`atabey quickstart` command** — 10-second demo project creation
- **`atabey explorer:graph`** — Mermaid import dependency graph generation
- **`atabey create-agent`** — Plugin SDK for custom agent creation
- **Initial MCP server setup** — `framework-mcp/` package with stdio transport

### Changed
- **Continuous compliance scanning** — Integrated into agent output pipeline
- **Multi-platform shim templates** — Cursor, Codex, Antigravity agent definitions
- **Event-driven architecture** — Hermes message polling loop with agent lifecycle management
- **Zero Type Hole and Zero Mock policies formalized** — Zod schemas for all tool inputs

---

## [0.0.10] - 2025-04-20

### Added
- **CLI-first design** — All operations accessible via command line
- **`orchestrate` command** — Autonomous agent orchestration loop
- **Phase system (PHASE_0-4)** — Contract-first development lifecycle
- **Risk Engine v1** — Keyword-based destructive operation detection with Human-in-the-Loop
- **202+ unit tests** — Real SQLite integration, zero mocks

---

*The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).*
