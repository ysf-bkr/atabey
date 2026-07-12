# Agent Atabey — Blind Spots, Limitations & Honest Status Report

**This document is the authoritative record of known limitations.**
It is written in a deliberately realistic and unvarnished tone. Atabey is pre-alpha software developed primarily by a single person. Many capabilities described in the README and marketing materials are partial, local-only, heuristic, or aspirational.

**Current version at time of writing:** 0.0.25

---

## Executive Summary

- **Maturity**: Pre-alpha (0.0.x series). Rapid iteration with frequent patch releases.
- **Primary audience today**: Individual developers and small teams experimenting with governed AI-assisted coding.
- **Core strength**: Deterministic rule-based middleware (governance pipeline, risk heuristics, discipline enforcement, PII masking, auto-rollback).
- **Core reality**: Most "enterprise governance", "autonomous orchestration", and "multi-agent" features run locally on one machine using SQLite + file-based state and polling. True isolation, distribution, accuracy, and durability are not yet present.
- **High-risk areas**: Un-sandboxed command execution, weak prompt injection defense, lossy in-memory security state, crude cost estimation, and incomplete permission enforcement.

Use this document before any production or high-stakes adoption.

---

## 1. Complete Lack of Execution Sandboxing (Highest Risk)

**Status**: All file writes and shell commands execute directly against the host filesystem and process.

**Details**:
- `run_shell_command` (even when restricted to an allow-list) runs on the developer's machine using `child_process.spawn`.
- `write_file`, `replace_text`, `patch_file`, `batch_surgical_edit` write directly to disk.
- There is no container, seccomp, WASM, gVisor, or even chroot isolation.
- A compromised or jailbroken host LLM (via prompt injection in a file comment, previous context, or tool output) can cause real damage: mass deletion, credential exfiltration, installation of packages, network calls, etc.
- Even the allow-list still permits powerful operations (`npm install`, `git push`, build commands, `rmdir`/`mv` in some contexts).

**Impact**: This is the single largest gap between current implementation and any credible "governance" or "enterprise" claim.

**Required future work**: Mandatory execution sandbox (Docker with volume mounts + resource limits, or a proper runtime like Firecracker / gVisor / WebContainer-style isolation). Command and file operations must be mediated through a restricted runtime by default.

---

## 2. Risk Engine, Discipline, and Prompt Injection Protection Are Heuristic Only

**Risk Engine** (`RiskEngine`):
- Pure keyword + glob + simple behavioral heuristics (delete/drop, .env paths, bulk patterns, line count estimates).
- No semantic understanding of intent, no data-flow analysis, no context of surrounding code.
- Easily bypassed by indirect language ("clean up the old user data thoroughly", "perform a complete reset of the accounts table", obfuscated paths, etc.).
- **Concrete bypass example:** `rm -rf /` is caught, but `find / -type f -exec rm {} +` is not. `DROP TABLE users` is caught, but `TRUNCATE users; DROP TABLE IF EXISTS users CASCADE` may pass depending on context.
- **Concrete bypass example:** Writing to `/etc/ssh/sshd_config` is not caught by path heuristics if the agent writes via `write_file` with a relative path like `../../etc/ssh/sshd_config`.

**PII Masking** (`pii.ts`):
- 20+ regex patterns (email, phone, TC ID, credit card, IBAN, IP, JWT, API key).
- **Over-masking problem:** Legitimate data like example emails (`user@example.com` in docs), test phone numbers (`+90 555 000 00 00` in test fixtures), or IP addresses in configuration examples (`192.168.1.1` in network configs) are silently corrupted.
- **Concrete example:** A developer writes a comment `// contact: admin@company.com for support` — the email is masked to `***@***` in logs, making debugging impossible.
- **Concrete example:** A test file contains `const TEST_IP = "192.168.1.1"` — this gets masked to `const TEST_IP = "***.***.***.***"`, breaking the test.
- **Under-masking problem:** Non-standard formats (e.g., `email at domain dot com`, base64-encoded secrets, hex-encoded API keys) pass through unmasked.
- No context awareness: PII masking cannot distinguish between a real credit card number and a fake one used in documentation.

**Prompt Injection Protection** (`PromptInjectionProtection` + discipline):
- Regex list against known phrases ("ignore all instructions", "DAN mode", etc.).
- Only inspects tool *responses* returned to the AI, not incoming task descriptions or file contents deeply.
- No structural parsing of LLM outputs or tool results.

**Discipline Engine**:
- Rate limits, file size caps, consecutive-call detection, and restricted tool lists exist.
- Most state (cooldowns, call history) lives in memory and is lost on MCP server restart.
- Enforcement is best-effort and incomplete across all code paths.

**Reality**: These layers provide useful friction and logging. They are not a robust security boundary.

---

## 3. Governance, Permissions, and RBAC Enforcement Is Incomplete

- Permission matrix (`.atabey/permission-matrix.json`) is optional and only consulted in specific tools (write/read, some shell cases).
- Tier-based rules (supreme/core/recon) are enforced narrowly (mainly shell writes for recon agents).
- Many tools and internal paths do not consult the matrix or governance rules.
- CRUD governance, authorized operations, and role rules are defined in config but enforcement is distributed across several modules with varying coverage.
- There is no centralized policy engine that all operations must pass through in a tamper-proof way.
- `@manager` and `@security` are "omnipotent" by design — a single compromised context can bypass most gates.

**Result**: The governance story is aspirational. In practice it reduces certain classes of mistakes but cannot be relied upon as hard security.

---

## 4. Hermes Orchestration, Messaging, and Concurrency Model Limitations

- Inter-agent communication uses SQLite tables + file locks under `.atabey/`.
- `AgentLoop` is a simple polling loop (`setInterval`).
- State for messages, locks, approvals, and traces is local to one process/machine.
- No distributed locking semantics, no at-least-once delivery guarantees across restarts, no conflict resolution for multi-developer scenarios.
- Git conflicts are likely if two machines write to the same `.atabey/` tree.
- Orchestrator auto-start and recovery are fragile (in-memory handles, no persistent job queue).

**Current suitability**: Single-developer local workflows only. Not suitable for team collaboration or CI agents without heavy manual coordination.

---

## 5. Memory, Embeddings, and Agent Learning Are Limited and Can Degrade

**Vector Memory**:
- Default embedding is a local TF-IDF implementation (~384 dimensions) with a small stop-word list.
- OpenAI `text-embedding-3-small` is used only when `OPENAI_API_KEY` is present.
- Search is simple cosine similarity over stored vectors. No ANN index, no hybrid search, no reranking.
- Quality of retrieval degrades with project size and noise.

**Specialty Memory (agent learning)**:
- Lessons are appended as raw markdown to `.atabey/memory/specialties/<agent>.md`.
- No deduplication, summarization, or pruning.
- Over time this bloats prompts and can introduce contradictory or low-value guidance.
- Learning is purely post-task and heuristic (based on compliance scan + optional lint).

**Project Memory**:
- Relies on a single `PROJECT_MEMORY.md` file that agents and the system are expected to keep in sync manually or via tools.
- No strong transactional guarantees.

**Effect**: Memory helps with continuity on small projects. It becomes a liability on larger or long-running efforts without manual curation.

---

## 6. FinOps / Token Economy Is a Rough Approximation Only

- Token usage is estimated everywhere as `Math.ceil(text.length / 4)`.
- This has no relationship to actual model tokenizers (cl100k_base, etc.) or real input/output splits.
- No distinction between system prompts, tool results, and user content.
- Cost calculations use a single configurable `costPer1kTokensUsd` value.
- Budget enforcement only activates when specific environment variables or config are set.
- There is no actual usage data from the underlying LLM provider in most cases (the host AI is external).

**Conclusion**: FinOps provides visibility and some guardrails for awareness. The numbers are not accurate enough for real financial governance or billing.

---

## 7. Critical Security and State Is Largely In-Memory and Non-Durable

Several important security mechanisms keep state only in process memory:
- Loop detector cooldowns and history
- Auto-rollback snapshots
- Discipline call counters and blacklists
- Some approval / HITL pending state

On MCP process restart (common with stdio transports), this state is lost. An agent can resume previously blocked behavior.

SQLite tables exist for messages, costs, agents, locks, etc., but:
- No schema migration system.
- No automatic backup/restore tooling.
- No integrity checks on startup.
- Corruption or concurrent access from multiple MCP instances can leave the system in a bad state.

---

## 8. Compliance, Quality Gates, and Static Analysis Are Brittle

- `any` detection is a simple regex `:\s*any\b` on the generated output text.
- `console.log` and other rules are also string/regex based in many places.
- Full compliance scans often shell out to `tsc --noEmit` and `eslint` on the host.
- These are slow, depend on the exact local environment, and can produce false positives/negatives.
- Quality gate runs after significant work has already been done in some flows.
- No deep AST analysis (e.g., using `@typescript-eslint/types` or `ts-morph`) for most rules inside the hot path.

---

## 9. Testing, Verification, and Integration Gaps

- 548+ unit and integration tests exist and currently pass (80 test files).
- However, there is limited simulation of real AI client behavior (stdio JSON-RPC roundtrips with Claude/Gemini/Cursor).
- Most governance tests are unit-level mocks.
- No automated end-to-end tests that spin up a real MCP client + LLM simulation.
- Dashboard UI has a trivial "test" script that does nothing.
- Performance, chaos, and long-running stability tests are absent.
- Many edge cases around restart, partial failure, concurrent tool calls, and large outputs are untested.

**Result**: Green test suite does not mean the system behaves safely under realistic adversarial or high-load usage.

---

## 10. Performance and Scalability Characteristics

- Polling loops (AgentLoop, various status checks) + repeated full-project scans.
- Vector search is linear over all stored entries.
- Compliance, indexing, and evaluation steps can become expensive as the codebase grows.
- No pagination, incremental indexing, or caching strategy for large projects.
- SQLite is used for almost everything; a single large project + long history can produce a big `.atabey/atabey.db` file with no compaction strategy documented.
- The system makes heavy assumptions that everything fits comfortably in one machine's memory and disk.

---

## 11. Multi-Platform Adapter and "Unified" Experience Reality

- `atabey init --unified` generates many adapter directories and shims.
- Actual tool exposure, skill availability, and instruction fidelity differ significantly per platform (Claude gets the most, Cursor/Grok/Codex get subsets).
- Many generated files are lightweight markdown/JSON shims rather than deep native integration.
- Keeping all seven platforms in sync as the tool set and agent definitions evolve is manual and error-prone.
- The framework repository itself intentionally does not contain the generated adapter directories (they are gitignored).

---

## 12. Environment, Packaging, and Installation Friction (Real)

- Hard dependency on `better-sqlite3` (native addon). Fails or requires build tools in many CI containers, restricted sandboxes, and certain Node versions.
- Peer dependencies are not automatically installed in all `npx` scenarios.
- Postinstall and `atabey:setup` scripts make assumptions about the host.
- Dist published packages have complex export maps that have required multiple fixes for circular dependencies and missing types.
- "Zero config" claim is aspirational; real usage frequently requires environment variables, config.json tuning, and manual repair commands (`atabey mcp install`, etc.).

---

## 13. HITL, Dashboard, and Operational Experience Limitations

- Human approvals often still require the developer to notice a blocked operation and run terminal commands or use the web dashboard.
- The dashboard (port 5858) is useful for local development but:
  - Has minimal authentication by default in unified mode.
  - Relies on WebSocket + REST polling with no built-in persistence of all UI state.
  - Is not designed or secured for multi-user team exposure.
- There is no integration with Slack, Teams, email, or GitHub for approvals.
- Observability is mostly local log files + in-memory metrics + dashboard. No standard export (OTEL, Prometheus, structured logging to external systems).

---

## 14. Claims vs Implementation Gap (Expectation Management)

Many public materials use language such as:
- "Enterprise-grade governance"
- "13 specialized agents" (they are role templates injected into one host LLM)
- "Multi-layer governance pipeline" (many layers exist but coverage and strength vary)
- "Autonomous orchestrator"
- Strong KVKK/GDPR / EU AI Act compliance framing

**Accurate description today**:
Atabey is a local, deterministic governance and routing layer that adds useful discipline, memory, and safety rails when using AI coding assistants. It reduces certain classes of errors and provides audit trails. It is not a replacement for proper sandboxing, access control, secret management, or production security tooling.

---

## 15. Additional Notable Limitations

- No robust secret management (relies on host `.env` + manual discipline).
- No built-in support for remote or multi-repository governance.
- Very limited polyglot support (standards and scaffolds are heavily Node/TypeScript oriented).
- No vision/multimodal awareness.
- No graceful degradation when external services (OpenAI for embeddings) are unavailable beyond simple fallback.
- Logging and audit are masked for PII but still local plaintext SQLite + markdown.
- No formal threat model or security audit by third parties.
- License (AGPL-3.0) has network-use implications that many users do not fully internalize.

---

## 16. Responsible Usage Recommendations (Current)

1. Treat Atabey as a powerful **local development assistant layer**, not a security product.
2. Never run it against production databases, production credentials, or high-value repositories without additional isolation.
3. Always review and understand the allow-list and risk rules before using `run_shell_command`.
4. Use the strictest profile and review every high-risk approval manually.
5. Keep regular git commits and external backups — Atabey state can be lost or corrupted.
6. Do not rely on the numerical values from FinOps for actual budgeting.
7. Prefer surgical edits (`replace_text`, `patch_file`) over broad writes.
8. Monitor the dashboard and logs when running long orchestration sessions.
9. For any team or enterprise use, assume you will need to add your own sandbox, secret management, and approval workflows on top.

---

## 17. Highest-Impact Areas for Future Work (to Reduce These Blind Spots)

- Execution sandbox / container runtime for all mutating operations.
- Real token counting + provider-aware cost tracking.
- Persistent, restart-safe security state (loop detection, approvals, snapshots).
- Proper schema migrations + backup tooling for SQLite.
- Stronger semantic analysis (real embeddings or local models + static analysis).
- Comprehensive E2E testing against simulated or real AI clients.
- Permission matrix enforcement that is universal and auditable.
- Production-grade message broker abstraction (optional Redis/NATS path).
- Dashboard authentication, multi-user support, and external notification integrations.
- Better summarization/pruning for specialty memory.
- Formal documentation of the threat model and remaining risks.

---

**Final note**: This file should be updated with every significant architectural decision or discovery. Honesty here protects users and the project. New limitations discovered during development or usage should be added promptly.

Last significant review: 2026-07-02

## Recent Alignment & Governance Improvements (Post-Audit)

The following items from this document have received direct code-level attention:
- Loop detection cooldowns and history now persist to SQLite (survives MCP restarts).
- Auto-rollback file snapshots now have durable disk backups under `.atabey/rollbacks/`.
- FinOps token estimation improved beyond naive `length/4`.
- Prompt injection pattern set expanded.
- Lint errors resolved.
- Tool count documentation synchronized (now consistently 39).

These changes make the governance and risk control layers more robust and restart-safe, better aligning the implementation with the project's "AI Governance" identity.

More items (sandboxing, universal permission enforcement, real tokenization, full E2E testing) remain as documented above.
