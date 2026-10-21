# 🗺️ Atabey — Project Roadmap

**Atabey** is an **AI Engineering Control Plane** ("Chief Engineer & Verification Layer") sitting above AI coding tools and models (Claude Code, Gemini CLI, Cursor, Codex, Local LLMs). Rather than acting as a prompt-to-toy-app builder, Atabey governs existing (brownfield) repositories across **4 Core Pillars**:
1. **Remember (Project Brain & Code Graph):** Symbol/import/API graph + ADR memory to eliminate full-repo re-scanning.
2. **Bound (Security, Privacy & Token Limits):** Secret vault, PII masking, fail-closed `PolicyGate`, HITL approval gate, and per-provider token/rate ceilings.
3. **Coordinate (Isolated Execution):** DAG wave dispatcher (`AgentDispatcher`) + isolated Git worktrees and sandboxes (`AgentRuntime`) executing a focused **Plan → Code → Verify** workflow.
4. **Verify & Prove (Deterministic Quality Gate):** Real TypeScript AST compliance, automated test execution, HMAC-SHA256 audit chain, and verifiable `EvidenceBundle` reports.

---

## 📈 Completed: `PHASE_0` & Core Hardening
- [x] **Core Governance & Security:** Fail-closed `PolicyGate`, universal tool permission matrix, AES-256-GCM `SecretManager` vault, TLS 1.3 + mTLS transport, and keyed HMAC-SHA256 immutable audit chain.
- [x] **Stateless MCP Server (40 Tools):** Consolidated, strictly typed MCP tool surface across Claude Code, Gemini CLI, Cursor, Antigravity, OpenCode, and Codex with 36 synchronized enterprise standards.
- [x] **Static Compliance & Token Limits:** TypeScript Compiler API AST scanner (`ast-scan.ts`), pre-write validation, real `cl100k_base` BPE tokenizer (`js-tiktoken`), and a multi-provider token pricing catalog (informational).
- [x] **Unified HTTP/SSE Control Plane:** JSON API + real-time WebSocket event stream (agents, Hermes, approvals, token telemetry); HITL approval via CLI/API. (The bundled React web UI was removed in favour of the headless API.)
- [x] **Agent Runtime P0 & DAG Dispatcher Core:** `HeadlessCliAdapter`, `AgentRuntime.runTurn`, per-agent Git worktree isolation (`worktree.ts`), fail-closed sandbox execution, OTel spans, and Kahn-wave `AgentDispatcher` (`dispatcher.ts`).

---

## ✅ Completed: 2026-10-20 Governance Audit Rounds (S7 / B1 / B2 / C3 / C4 / D3)
- [x] **Storage Decomposition (S7):** the 1,390-line `AtabeyStorage` god-class split into 17 domain modules behind a backward-compatible facade.
- [x] **Agent Git Flow (B1):** `atabey git pr` (push + PR via `gh` + compare-URL fallback + protected-branch guard + `--auto-commit`) and `atabey git ci-status` (CI results fed back to agents as structured Hermes `CI_RESULT` messages).
- [x] **Structured Handoffs (B2):** Zod-validated agent handoff contract (work performed, changed files, test runs, open issues, next steps) wired into the executor runtime path.
- [x] **Planning Gates (C4):** required acceptance criteria on `submit_plan` (schema + CLI validation) and `atabey plan list` backlog view.
- [x] **Memory Quality (C3):** class-aware lesson persistence gate (corrective lessons always persisted; noise never) + `atabey db compact` maintenance command.
- [x] **Benchmark Harness (D3):** `npm run benchmark` executing `docs/benchmark-protocol.md` (scenario registry, metrics from the audit DB, deterministic acceptance checks, prompt files).
- [x] **Turkish routing fixes, 95+ silent-catch logging fixes, +92 tests (703 → 795), coverage ratchets** (see CHANGELOG `[Unreleased]`).

---

## ✅ Completed: `PHASE_1` & `PHASE_2` (Isolated Execution, Evidence Bundle & Project Brain)
- [x] **Phase A — Isolated Execution & Evidence Bundle (P1 Completion):**
  - Full unit & integration coverage for `AgentDispatcher` (waves, cycle detection, per-agent lock, token ceiling).
  - Worktree file-conflict detection and automated **Evidence Bundle** (`diff + AST check + test status + token cost + HMAC digest`).
  - Wire `PlanningEngine` → `AgentDispatcher` into `atabey orchestrate` / `coordinate_task` using the focused **Planner → Coder → Verifier** flow.
- [x] **Phase B — Project Brain & Incremental Code Graph (F1):**
  - Incremental AST symbol/import/endpoint graph persisted in SQLite (`CodeGraph`).
  - `ContextAssembler` + `get_task_context` MCP tool feeding agents targeted symbol/file context from memory without full-repo scans.
- [x] **Phase C & D — Token Ceilings, Signed Audit Export & Distributed Bus:**
  - Per-provider token/rate ceilings and smart truncation of oversized file reads.
  - Cryptographically verifiable CSV/JSON audit trail export (`atabey audit export`).
  - **Hermes WSS Bus:** Zero-dependency WebSocket message hub (`/bus` over TLS 1.3/mTLS) with server-authoritative distributed locks.
  - **Native OS Sandbox (no Docker):** macOS `seatbelt` (`/usr/bin/sandbox-exec`) + POSIX `uid` drop for fail-closed process isolation.

---

## 🔬 Next Horizon (`PHASE_3+`: Polyglot & Multi-Repo Governance)
- [x] **Strict Execution Ledger (`task.md`) & Zero-Defect UI Kit Verification (`T-041` / `T-042`).**
- [ ] **Deep Polyglot AST Analysis:** Extend AST compliance scanners beyond TypeScript to Go, Python, and Rust.
- [ ] **Multi-Repo Control Plane:** Cross-repository contract drift and federated `CodeGraph` indexing.

## 🗓️ v0.2 Plan (deferred decisions from the 2026-10-20 governance audit)
- [ ] **`utils/` barrel cleanup (S12):** remove the backward-compatibility alias barrels in `atabey-mcp/src/mcp/utils/` (one-line re-exports of `modules/*`) and collapse to the `modules/` layout — a deliberate breaking change, deferred to the next minor/major boundary.
- [ ] **Full producer/checker separation (A3):** today `@quality`/`@security` can already run as independent headless CLI processes via `AgentDispatcher` (worktree-isolated), but a single host model still plays all roles in interactive chat. Evaluate running verification turns on a different model/provider by default.
- [ ] **Issue tracker integration (C4 extension):** link `submit_plan` acceptance criteria to external trackers (GitHub Issues/Projects).
- [ ] **God-file decomposition, remaining 6:** `scaffold-app.ts` (863), `definitions.ts` (664), `governance.ts` (660), `routing-engine.ts` (641), `human-in-loop.ts` (524), `loop-detector.ts` (520) — follow the proven `storage.ts` domain-split pattern.

