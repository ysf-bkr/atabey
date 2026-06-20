# Changelog — Agent Atabey

All notable changes to this project are documented in this file.

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
