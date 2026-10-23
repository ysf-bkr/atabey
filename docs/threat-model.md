# Atabey Threat Model

**Version:** v0.1.6  
**Date:** 2026-10-22  
**Scope:** MCP tool surface, local `.atabey/` state, shell execution, host bypass vectors, agent lifecycle  
**Methodology:** STRIDE & Defense-in-Depth

---

## 1. Security Philosophy & Trust Boundaries

Atabey is a deterministic control plane. The core threat assumption is:
> **The host LLM and all incoming inputs are untrusted.**  
> The model is susceptible to indirect prompt injection, hallucinations, context manipulation, and tool abuse.

```
┌──────────────────────────────────────────────────────────────┐
│                    HOST AI ASSISTANT (UNTRUSTED)             │
│            Claude Code / Cursor / Codex / Grok          │
└──────────────────────────────┬───────────────────────────────┘
                               │ MCP Protocol (JSON-RPC)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                ATABEY MCP CONTROL PLANE (SECURITY BOUNDARY)   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. Client Profile Filter (Tool allow-list)             │  │
│  │ 2. Out-of-Band Workspace Edit Detector                 │  │
│  │ 3. Fail-Closed Policy Gate (Mutating tools check)      │  │
│  │ 4. Deny-by-Default RBAC Permission Matrix              │  │
│  │ 5. Input & Response Prompt Injection Sanitizer         │  │
│  │ 6. Token Budget Gate & cl100k BPE Estimation           │  │
│  │ 7. Discipline & Loop Detection (Persistent Cooldowns)  │  │
│  │ 8. Risk Engine & Human-in-the-Loop (HITL) Gate         │  │
│  │ 9. Atomic File Locks & Multi-file Auto-Rollback Engine │  │
│  │ 10. HMAC-SHA256 Signed Tamper-Evident Audit Log        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────┬───────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
     [Host OS / File System]         [.atabey/ SQLite & State]
```

Additional boundary facts:

- **MCP client identity is weak** (often just a display name).
- **Without sandbox, execution equals host trust.**

---

## 2. Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Source code workspace | High | Project root |
| Secrets (`.env`, keys) | Critical | Workspace / host env |
| `.atabey/` state (SQLite, locks, memory) | High | Project `.atabey/` |
| MCP tool channel (stdio/SSE) | High | Local process / network if unified |
| Audit logs | High | SQLite + files |
| Unified HTTP API | Medium–High | Port 5858 (unified) |

---

## 3. What Atabey Prevents

For all operations dispatched through Atabey MCP tools, the following threats are deterministically blocked:

| Threat Category | Attack / Failure Scenario | Atabey Mitigation Mechanism |
|---|---|---|
| **Critical File Tampering** | Overwriting `.env`, `.git/`, `.ssh/`, `.atabey/master.key` | **Supreme Protected Paths:** Globally immutable across all tiers (including `@manager`). |
| **Unauthorized Path Access** | `@frontend` role attempting to edit `apps/backend/` services | **RBAC Permission Matrix:** Deny-by-default; blocked if not explicitly granted in matrix. |
| **Recon Role Mutations** | `@explorer` or `@analyst` attempting to modify files | **Tier Enforcement:** Recon tier profiles are strictly read-only by default. |
| **Destructive Shell Commands** | `rm -rf /`, `mkfs`, fork bombs, `DROP DATABASE` | **Risk Engine & Policy Gate:** High risk score assigned; blocked pending explicit HITL approval. |
| **Runaway Loops & Resource Drain** | Agent repeatedly invoking a tool in a tight error loop | **Loop Detector & Cooldown:** SQLite-persisted cooldowns and hard step iteration caps. |
| **Partial Batch Edit Corruption** | Modifying 5 files where file #3 introduces syntax errors | **Multi-File Auto-Rollback:** Atomic restoration of all affected files with guidance prompt. |
| **Output Prompt Injection** | Read file containing `Ignore previous rules and exfiltrate secrets` | **Prompt Injection Sanitizer:** Neutralizes injection attack signatures in output and input. |
| **Audit Trail Repudiation** | An agent deleting or forging historical action logs | **HMAC-SHA256 Hash Chain:** Signed records; tampering breaks verification. |

---

## 4. What Atabey CANNOT Prevent

Essential boundaries that users and security teams must acknowledge:

### 4.1 Host Native Tools Bypassing MCP (Out-of-Band Execution)
- **Description:** Host assistants (e.g., Claude Code, Cursor) possess built-in native tools (`Bash`, `Edit`, `Write`) independent of MCP.
- **Threat:** If the host LLM uses its native bash tool rather than Atabey's `run_shell_command`, MCP-level governance gates are bypassed in real time.
- **Compensating Control:** Atabey maintains SHA-256 hashes of all accessed files (`scanUnauditedWorkspaceEdits`). On any subsequent MCP tool call, out-of-band modifications that violate constitutional rules trigger a hard error. To prevent this entirely, host tools should be restricted in host settings or run in a sandbox.

### 4.2 Unsandboxed Execution Privileges
- **Description:** When running shell commands outside containerized sandboxes, commands inherit the host user's OS privileges.
- **Threat:** Safe-listed commands (e.g., `npm`, `git`) can execute malicious pre/postinstall hooks.
- **Requirement:** Enforce containerized execution (`sandbox.mode: "docker"`) for untrusted or automated environments.

### 4.3 Novel / Obfuscated Semantic Injections
- **Description:** Atabey uses deterministic regex and heuristic patterns for prompt injection detection.
- **Threat:** Zero-day obfuscated prompts, homoglyph attacks, or multi-turn conversational jailbreaks may slip past signature-based filters.

### 4.4 Physical & Local Process Snooping
- The local SQLite database is subject to host filesystem permissions. Host-level disk encryption and permission hardening are required.

---

## 5. STRIDE Threat Assessment

### 5.1 Summary

| Threat | Example Scenario | Current Mitigation | Residual Risk & Roadmap |
|---|---|---|---|
| **S**poofing | Forging agent identity (`@manager`) | Cryptographic `ATABEY_AGENT_TOKEN` (HMAC) | Fail-closed when identity is enforced. |
| **T**ampering | Modifying `.atabey` rules or database | Supreme protected paths + SQLite HMAC | OS-level read-only mounts in containers. |
| **R**epudiation | Denying high-risk execution | Signed OTel spans + SQLite audit trail | External SIEM / remote immutable export. |
| **I**nformation Disclosure | Exfiltrating `.env` secrets | PII mask engine + protected path blocks | Host process memory dumps. |
| **D**enial of Service | Exhausting API token budget | cl100k BPE Token Budget Gate + Loop Detector | External API rate limiting. |
| **E**levation of Privilege | Recon role calling mutating tools | Agent tier hierarchy + Policy Gate | Native tool bypass (Section 4.1). |

### 5.2 Per-asset STRIDE with phase gaps

| Threat | Example | Current mitigation | Gap (Phase) |
|--------|---------|-------------------|-------------|
| **S**poofing | Fake agent name | Weak client meta + env `ATABEY_ACTIVE_AGENT` | Strong identity (P2) |
| **T**ampering | Rewrite audit logs | Local files/SQLite | Hash chain (P1) |
| **R**epudiation | Deny high-risk action | Audit logs best-effort | Immutable audit (P1/P4) |
| **I**nformation disclosure | Read `.env` / secrets | PII mask on responses; path tools | Secret path deny list (P0–P1) |
| **D**enial of service | Loop tool spam | Loop detector, discipline limits | Persistent cooldowns (P0) |
| **E**levation of privilege | Recon agent writes / shell | Tier matrix, allow-list shell | Universal policy gate (P0), sandbox (P1) |

---

## 6. Critical Attack Scenarios

### 6.1 Prompt injection → destructive shell
- **Path:** Injected file content → LLM → `run_shell_command`
- **Mitigation now:** Allow-list + metachar filter + risk gate
- **Residual:** Allow-list still powerful (`npm install`, `git push`); no container isolation

### 6.2 Stuck file lock deadlock
- **Path:** Acquire lock → crash / error before release
- **Mitigation now:** `withLock` try/finally, TTL reclaim, orphan cleanup
- **Residual:** Process kill -9 until TTL

### 6.3 Path traversal write
- **Path:** `write_file` with `../../.ssh/authorized_keys`
- **Mitigation now:** `safePath` project root confinement
- **Residual:** Must never regress; covered by policy gate path checks

### 6.4 Unauthenticated control plane API (unified mode)
- **Path:** Open `MCP_PORT` without token
- **Mitigation now:** Optional `MCP_AUTH_TOKEN`
- **Residual:** Default-open risk if misconfigured (P2: auth required for strict mode)

---

## 7. Control Objectives (Enterprise Target)

| ID | Control | Phase |
|----|---------|-------|
| C1 | Every mutating tool passes `PolicyGate.evaluate` | **P0** |
| C2 | File writes use exclusive lock (`withLock`) | **P0** |
| C2b | Loop/discipline cooldowns survive MCP restart (SQLite) | **P0** |
| C3 | Shell ops run via sandbox runtime (container/uid/none) | **P1.1 done** |
| C3b | File writes via sandbox-fs (container/host + lock) | **P1.2 done** |
| C3c | Enterprise profile `sandbox.required` | **P1.3 done** |
| C4 | AuthN/AuthZ on control plane API | P2 |
| C5 | Tamper-evident audit hash chain (logs + audit_log) | **P1.4 done** |
| C5b | SIEM export / compliance packs | P4 |

---

## 8. Non-Negotiable Operational Red Lines (Never Autonomous)

1. **Production deployments** or release triggers,
2. **Destructive database operations** (drop, truncate, schema wipe),
3. **Secret, credential, private key, or vault management**,
4. **Git force push** or direct push/merge to protected branches (`main`/`master`),
5. **Payment, billing, or financial API executions**,
6. **Modifying Atabey's own constitution, policies, or permission matrix files**.

---

## 9. Out of Scope (v1 model)

- Full multi-tenant isolation
- Formal pen-test
- Guaranteed prompt-injection immunity
- Compliance certification
