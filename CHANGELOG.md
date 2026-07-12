# Changelog — Agent Atabey

All notable changes to this project are documented in this file.

---

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
