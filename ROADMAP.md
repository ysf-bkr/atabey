# 🗺️ Atabey — Project Roadmap

**Atabey** is an **AI Engineering Control Plane** ("Chief Engineer & Verification Layer") sitting above AI coding tools and models (Claude Code, Gemini CLI, Cursor, Codex, Local LLMs). Rather than acting as a prompt-to-toy-app builder, Atabey governs existing (brownfield) repositories across **4 Core Pillars**:
1. **Remember (Project Brain & Code Graph):** Symbol/import/API graph + ADR memory to eliminate full-repo re-scanning.
2. **Bound (Security, Privacy & FinOps):** Secret vault, PII masking, fail-closed `PolicyGate`, HITL approval gate, and hard per-agent token/cost ceilings.
3. **Coordinate (Isolated Execution):** DAG wave dispatcher (`AgentDispatcher`) + isolated Git worktrees and sandboxes (`AgentRuntime`) executing a focused **Plan → Code → Verify** workflow.
4. **Verify & Prove (Deterministic Quality Gate):** Real TypeScript AST compliance, automated test execution, HMAC-SHA256 audit chain, and verifiable `EvidenceBundle` reports.

---

## 📈 Completed: `PHASE_0` & Core Hardening
- [x] **Core Governance & Security:** Fail-closed `PolicyGate`, universal tool permission matrix, AES-256-GCM `SecretManager` vault, TLS 1.3 + mTLS transport, and keyed HMAC-SHA256 immutable audit chain.
- [x] **Stateless MCP Server (39 Tools):** Consolidated, strictly typed MCP tool surface across Claude Code, Gemini CLI, Cursor, Antigravity, OpenCode, and Codex with 34 synchronized enterprise standards.
- [x] **Static Compliance & FinOps:** TypeScript Compiler API AST scanner (`ast-scan.ts`), pre-write validation, real `cl100k_base` BPE tokenizer (`js-tiktoken`), and multi-provider FinOps pricing catalog.
- [x] **Control Plane Web Dashboard:** React Router SPA, 14 UI primitives, 100% TR/EN i18n parity (294 keys), interactive HITL approval center, and FinOps telemetry.
- [x] **Agent Runtime P0 & DAG Dispatcher Core:** `HeadlessCliAdapter`, `AgentRuntime.runTurn`, per-agent Git worktree isolation (`worktree.ts`), fail-closed sandbox execution, OTel spans, and Kahn-wave `AgentDispatcher` (`dispatcher.ts`).

---

## 🚀 Active: `PHASE_1` (Isolated Execution, Evidence Bundle & Project Brain)
- [ ] **Phase A — Isolated Execution & Evidence Bundle (P1 Completion):**
  - Full unit & integration coverage for `AgentDispatcher` (waves, cycle detection, per-agent lock, token ceiling).
  - Worktree file-conflict detection and automated **Evidence Bundle** (`diff + AST check + test status + token cost + HMAC digest`).
  - Wire `PlanningEngine` → `AgentDispatcher` into `atabey orchestrate` / `coordinate_task` using the focused **Planner → Coder → Verifier** flow.
- [ ] **Phase B — Project Brain & Incremental Code Graph (F1):**
  - Incremental AST symbol/import/endpoint graph persisted in SQLite (`CodeGraph`).
  - `ContextAssembler` that feeds agents targeted symbol/file context from memory without full-repo scans (target: ≥70% read-token reduction).
- [ ] **Phase C — FinOps Ceilings & Signed Audit Export:**
  - Per-agent budget configuration & webhook alerts in the Web Dashboard.
  - Cryptographically verifiable CSV/JSON audit trail export.

---

## 🔬 Medium-Term Vision (`PHASE_2+`: Distributed Control Plane)
- [ ] **Hermes WSS Bus:** Zero-dependency WebSocket message hub (`/bus` over TLS 1.3/mTLS) with server-authoritative distributed locks and SQLite replay backlog.
- [ ] **Deep Polyglot AST Analysis:** Extend AST compliance scanners beyond TypeScript to Go, Python, and Rust.
- [ ] **Self-Hosted Enterprise Appliance:** Turnkey container/helm deployment with OIDC/RBAC and multi-repo governance.

