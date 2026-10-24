# Atabey — Known Limitations & System Boundaries (LIMITATIONS.md)

**Version:** v0.1.8  
**Last Updated:** 2026-10-23  
**Status:** Active Living Document

This document transparently presents the actual architecture, operational boundaries, and
deliberately out-of-scope aspects of Atabey. Atabey is not a magic wand; it is a local
**governance and verification layer** for AI coding agents.

## 0. What Atabey Is Not

- **Not an LLM and not a code generator.** It does not choose models, host inference, or write your code.
- **Not universal control over the host.** Controls apply to operations that go through Atabey MCP tools (see §3).
- **Not a correctness or security guarantee.** Passing the quality gate does not prove code is bug-free or secure; human review remains required.
- **Not a legal compliance certification.** KVKK/GDPR features are technical controls only (§1.2).
- **Not a production deployment tool.** It will not run production deploys, destructive migrations, or protected-branch merges autonomously (§1.3).

---

## 1. Core Boundaries & Scope Charter

### 1.1 In-Scope
- **Policy & Authorization Enforcement:** Deny-by-default file RBAC matrix, protected paths (`.env`, `.git/`, `.atabey/*`), tiered agent hierarchy (Supreme / Core / Recon).
- **Risk Engine & Gates:** Static analysis, AST risk scoring, destructive shell command blocking, and mandatory Human-in-the-Loop (HITL) approvals.
- **Token Economics:** Model token tracking, per-provider token/rate limits, step/iteration caps, and hard execution timeouts.
- **Audit Trail:** Local HMAC-SHA256 signed audit trails and hash-chained logs. Tampering is
  *detectable* rather than impossible: anyone with access to both the database and the HMAC
  key file can rewrite history. Export to external storage if you need stronger guarantees.
  OTel spans follow the W3C format.
- **Human Approval (HITL):** Explicit human clearance via CLI (`atabey hitl answer` / `atabey approve`) or MCP for operations exceeding defined risk thresholds.

### 1.2 Out-of-Scope
- **Custom Model Runtime:** Atabey does not host an LLM model, API inference gateway, or independent LLM runtime (unlike LangGraph or CrewAI).
- **ML-Based Threat Analysis:** No neural anomaly detection or heuristic ML classifiers; Atabey relies on deterministic AST, regex patterns, and rule engines.
- **Legal Compliance Certification:** PII and KVKK/GDPR sanitization tools are technical enablers, not formal legal compliance guarantees.
- **Multi-Node Distributed Orchestration:** Not a distributed Kubernetes or multi-machine cluster orchestrator; tailored for local developer environments or single-host runners.

### 1.3 Autonomy Definition & Red Lines
- **Autonomous Agent:** A host CLI process (e.g., Claude Code, Codex CLI) spawned, bounded, and monitored by Atabey.
- **Target Autonomy Level:** Constrained within sandbox + step limits, outputting pull requests (PR / git diff) on isolated branches. Unsupervised production access is strictly out-of-scope.
- **Operations That Will NEVER Be Autonomous:**
  1. Production deployments or release pipeline execution,
  2. Destructive database migrations, drops, or truncations,
  3. Secret, API key, vault, or `.env` credential management,
  4. Force pushing or directly committing/merging into protected branches (`main`/`master`),
  5. Financial or payment gateway API transactions,
  6. Modifying Atabey's own governance constitution, policy, or permission matrix files (`.atabey/*`).

---

## 2. Agent Reality: "13 Role Profiles", Not "13 Independent Agents"

Atabey does not run 13 concurrent independent LLM processes or backend model servers.
- **Actual Architecture:** Your single connected host AI assistant (Claude Code, Cursor, Codex, etc.) executes operations sequentially.
- **Role Profile Mechanism:** On `@agent` invocations, Atabey dynamically injects tailored system role definitions, context constraints, and task blueprints into the host session.
- **Limitation:** The host LLM assumes the profile persona but can hallucinate or suffer prompt leakage. Consequently, Atabey deterministically enforces boundaries and permission matrices at the MCP tool layer.

---

## 3. Host Native Tool Bypass Risk (Out-of-Band Execution)

A fundamental architectural boundary:
- Modern AI assistants (Claude Code, Cursor, Codex) possess native, built-in tools (e.g., `Bash`, `Edit`, `Write`, `Grep`).
- If the host AI decides to invoke its native shell instead of calling Atabey MCP tools (`run_shell_command`, `write_file`), MCP-level permission matrices and risk gates are bypassed during execution.
- **Atabey Mitigations & Residual Risk:**
  1. Atabey maintains SHA-256 digests of all read/written files (`scanUnauditedWorkspaceEdits`). On any subsequent MCP tool invocation, out-of-band workspace modifications violating constitutional rules trigger a hard stop.
  2. **Claude Code only:** `atabey init claude` writes a `PreToolUse` hook plus
     `permissions.deny` for `Edit`, `Write`, `NotebookEdit` and `MultiEdit`, and the hook
     denies shell writes it can recognise (redirects, `rm`/`mv`/`cp`, `sed -i`, `chmod`,
     `PowerShell Remove-Item`/`Set-Content`, `git reset --hard`, …). Atabey's own
     `mcp__atabey__*` tools are never blocked. This is pattern matching, not a parser: an
     obfuscated shell write (base64, `eval`, unusual binaries) can still get through, so the
     `permissions.deny` list — not the hook — is what actually removes the built-in tools.
  3. **Every other adapter is MCP-only.** Cursor, Codex, VS Code/Copilot, OpenCode, Grok,
     Antigravity and local hosts keep their native tools; Atabey only sees calls they route
     through its MCP tools. For full enforcement, restrict the host's own file-write
     permissions in its settings.
  4. OS-level containment (Docker sandbox, seccomp, seatbelt) is mandatory for absolute
     boundary guarantees.

---

## 4. Permission Matrix & Sandbox Realities

- **Deny-by-Default:** No write or read operation is permitted unless explicitly granted in `permission-matrix.json` for that agent profile.
- **Protected Paths:** Sensitive files (`.env*`, `.ssh/*`, `.git/*`, `.atabey/*`, private keys) are read-only through Atabey MCP tools at every tier (even Supreme `@manager`). This is enforced in the MCP layer, not by OS permissions.
- **Sandbox Requirement:** When `sandbox.mode: "none"` (standard local development), shell commands inherit the host user's privileges. Production or automated runner environments must enforce containerized execution (`sandbox.mode: "docker"`).

---

## 5. Risk & Rule Engine Limitations

- Certain safety filters rely on regular expressions.
- Sophisticated shell chaining (`sh -c "$(base64 -d ...)"`, `eval`, process substitution) can circumvent regex filters.
- Shell AST parsers and SQL query AST analyzers provide stronger guarantees and represent the ongoing migration path.

---

## 6. Storage, Queue, and Memory

- **Retention is narrower than the category table suggests.** Automatic cleanup expires
  messages and execution logs (30 days) and audit rows (30 days default, 90 max). Tasks, cost
  rows and approval records have no automatic expiry and require explicit erasure. See
  [PRIVACY.md](../PRIVACY.md).
- **Embedding providers are not comparable.** With `OPENAI_API_KEY` set, embedded text leaves
  the machine; without it, local TF-IDF is used. Vectors from different providers are never
  scored against each other, so entries indexed under the other provider are skipped until you
  re-index.

- Atabey utilizes local SQLite (`better-sqlite3`).
- To prevent database deadlocks during multi-agent concurrency, Atabey enforces explicit file locking (`withLock`) and TTL reclaim mechanisms.
- Hermes messaging bus operates with in-memory / SQLite backings; SQLite databases require periodic compaction and vacuum strategies.
- Specialty memory should remain structured and summarized rather than acting as an unbounded append-only markdown log.

---

## 7. Best Practice Operational Recommendations

1. **Worktree / Branch Isolation:** Always run autonomous tasks inside isolated git worktrees or dedicated feature branches. Never point agents directly at `main`.
2. **Preserve Human-in-the-Loop:** Retain human approval gates on high-risk shell commands and destructive operations.
3. **Isolate Credentials:** Store API keys in system vaults or Atabey Vault rather than leaving plaintext `.env` files in the workspace.
4. **Emergency Kill Switch:** In case of runaway loops or unexpected actions, use the terminal kill command (`Ctrl+C`) or the `atabey` process supervisor to stop the agent immediately.
