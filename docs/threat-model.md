# Atabey Threat Model (v1)

**Status:** Phase 0 foundation  
**Scope:** MCP tool surface, local `.atabey/` state, shell/file execution  
**Method:** STRIDE per major asset  

This document is the starting point for the enterprise security roadmap. Residual risks remain until Phase 1 (sandbox) is complete.

---

## 1. Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Source code workspace | High | Project root |
| Secrets (`.env`, keys) | Critical | Workspace / host env |
| `.atabey/` state (SQLite, locks, memory) | High | Project `.atabey/` |
| MCP tool channel (stdio/SSE) | High | Local process / network if unified |
| Audit logs | High | SQLite + files |
| Dashboard API | Medium–High | Port 5858 (unified) |

---

## 2. Trust boundaries

```
[IDE / Host LLM] --MCP--> [atabey-mcp process] --spawn/fs--> [Host OS / files]
                              |
                              +--> [.atabey/ SQLite, locks]
```

- **Host LLM is untrusted** (prompt injection via files/tool output).
- **MCP client identity is weak** (often just a display name).
- **Without sandbox, execution = host trust**.

---

## 3. STRIDE summary (MCP tools)

| Threat | Example | Current mitigation | Gap (Phase) |
|--------|---------|-------------------|-------------|
| **S**poofing | Fake agent name | Weak client meta + env `ATABEY_ACTIVE_AGENT` | Strong identity (P2) |
| **T**ampering | Rewrite audit logs | Local files/SQLite | Hash chain (P1) |
| **R**epudiation | Deny high-risk action | Audit logs best-effort | Immutable audit (P1/P4) |
| **I**nformation disclosure | Read `.env` / secrets | PII mask on responses; path tools | Secret path deny list (P0–P1) |
| **D**enial of service | Loop tool spam | Loop detector, discipline limits | Persistent cooldowns (P0) |
| **E**levation of privilege | Recon agent writes / shell | Tier matrix, allow-list shell | Universal policy gate (P0), sandbox (P1) |

---

## 4. Critical attack scenarios

### 4.1 Prompt injection → destructive shell
- **Path:** Injected file content → LLM → `run_shell_command`
- **Mitigation now:** Allow-list + metachar filter + risk gate
- **Residual:** Allow-list still powerful (`npm install`, `git push`); no container isolation

### 4.2 Stuck file lock deadlock
- **Path:** Acquire lock → crash / error before release
- **Mitigation now:** `withLock` try/finally, TTL reclaim, orphan cleanup
- **Residual:** Process kill -9 until TTL

### 4.3 Path traversal write
- **Path:** `write_file` with `../../.ssh/authorized_keys`
- **Mitigation now:** `safePath` project root confinement
- **Residual:** Must never regress; covered by policy gate path checks

### 4.4 Unauthenticated dashboard (unified mode)
- **Path:** Open `MCP_PORT` without token
- **Mitigation now:** Optional `MCP_AUTH_TOKEN`
- **Residual:** Default-open risk if misconfigured (P2: auth required for enterprise)

---

## 5. Control objectives (enterprise target)

| ID | Control | Phase |
|----|---------|-------|
| C1 | Every mutating tool passes `PolicyGate.evaluate` | **P0** |
| C2 | File writes use exclusive lock (`withLock`) | **P0** |
| C2b | Loop/discipline cooldowns survive MCP restart (SQLite) | **P0** |
| C3 | Shell ops run via sandbox runtime (container/uid/none) | **P1.1 done** |
| C3b | File writes via sandbox-fs (container/host + lock) | **P1.2 done** |
| C3c | Enterprise profile `sandbox.required` | **P1.3 done** |
| C4 | AuthN/AuthZ on control plane + dashboard | P2 |
| C5 | Tamper-evident audit hash chain (logs + audit_log) | **P1.4 done** |
| C5b | SIEM export / compliance packs | P4 |

---

## 6. Phase 0 acceptance (this iteration)

- [x] Threat model published (`docs/threat-model.md`)
- [x] Universal policy gate on mutating MCP tools (`policy-gate` + governance middleware)
- [x] Write tools use `withLock` (try/finally) — write/replace/patch/batch
- [x] Tests for gate deny + lock release on failure

---

## 7. Out of scope (v1 model)

- Full multi-tenant isolation
- Formal pen-test
- Guaranteed prompt-injection immunity
- Compliance certification

---

*Last updated: Phase 0 kickoff*
