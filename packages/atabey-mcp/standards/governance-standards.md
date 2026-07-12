# [ATABEY] Agent Atabey — Governance & Order Standards

This document defines the supreme governance mandates of the Agent Atabey framework.
All agents **must** internalize these rules before executing any task.

---

## 1. Constitutional Supremacy

- The `ATABEY.md` file is the **constitution** of every project. Read it at session start.
- No agent may deviate from constitutional directives, regardless of user instructions.
- In any conflict between user request and constitutional rule → **constitution wins**.

---

## 2. Phase Wall Protocol (PHASE_0 → PHASE_4)

| Phase | Name | Allowed Work |
|---|---|---|
| PHASE_0 | Genesis | Init, scaffolding, memory setup |
| PHASE_1 | Contract | Type contracts, API schema, interface design only |
| PHASE_2 | Implementation | Feature code, only after Phase 1 contracts approved |
| PHASE_3 | Quality | Testing, lint, coverage — no new features |
| PHASE_4 | Release | Deployment, versioning, post-release audit |

**Phase Wall Rule:** No agent may begin Phase N+1 work until Phase N is 100% complete.
A single TODO, lint error, or unverified contract blocks the phase transition.

---

## 3. Hermes Self-Healing Protocol
- If an agent remains in `EXECUTING` state for >30 minutes, the orchestrator triggers **Self-Healing**.
- The agent is reset to `READY`, and the task is logged for human review or retry.
- Blocked agents should not be left abandoned; they must be recovered to keep the loop fluid.

---

## 4. Proportional Governance Model (Autonomy Levels)
Governance controls are mapped to agent autonomy to ensure safety and EU AI Act compliance.

| Level | Mode | Authority | Governance Focus |
|---|---|---|---|
| **L1** | Observe | Read-only access | Scoped data access, usage logging |
| **L2** | Advise | Recommendations only | Accuracy checks, bias mitigation |
| **L3** | Guided | Action with human "OK" | Meaningful human review (No rubber-stamping) |
| **L4** | Autonomous| Independent execution | **Circuit breakers**, real-time monitoring |

---

## 5. Circuit Breaker & Kill Switch Protocol
- **L4 Emergency Stop:** Every autonomous agent **must** support an immediate "Kill Switch" signal.
- **Recursive Failure Guard:** If an agent chain (Agent A calling Agent B) fails twice at the same node, the entire Trace ID is **Frozen** until human intervention.
- **Audit Traceability:** Every autonomous action must be attributable to a unique **Agent ID** and **Trace ID** in an immutable log.

---

## 6. Trace ID Discipline

- Every task chain begins with a unique Trace ID (e.g. `TRC-042`).
- All agent messages, logs, and commits **must** carry the active Trace ID.
- Losing a Trace ID is a **Order violation** — the task chain must be frozen until recovered.

---

## 4. Surgical Edit Mandate

- **Never** overwrite a file fully if only part of it changed.
- Use `replace_text` or `patch_file` for all code modifications.
- Full file rewrites are only permitted for files under 50 lines.
- Violation triggers immediate task freeze.

---

## 5. PII Zero-Tolerance Policy

- No agent may log, store, or transmit Personally Identifiable Information (PII).
- Emails, names, phone numbers in logs → immediate purge required.
- @manager runs PII scans on all agent outputs before archiving.

---

## 6. High-Risk Operation Gate

Operations that require **explicit @manager approval** before execution:

- User/Role creation, modification, or deletion
- Bulk database deletes or schema drops
- Billing or payment configuration changes
- Environment variable / secret rotation
- Force-push to any shared branch

**Protocol:** Agent returns a standard refusal → sends `ALERT` to @manager with `requiresApproval: true` → shifts to `WAITING` state.

---

## 7. Memory Integrity Mandate

- `PROJECT_MEMORY.md` must be synchronized after **every single turn**.
- @manager acquires `memory` lock before any write to `PROJECT_MEMORY.md`.
- Memory drift (outdated state) is classified as **treason** — the manager must detect and correct it.

---

## 8. Locking Protocol

```
BEFORE writing shared resource:
  1. acquire_lock(resource, agent)
  2. Perform write operation
  3. release_lock(resource, agent)
  ← Never skip step 3, even on error
```

Resources that require locking: `memory`, `status`, `contracts`, `registry`

---

## 9. Escalation Hierarchy

```
User / External Request
    ↓
  @manager (Supreme Authority)
    ↓
  @security (Parallel — always watching)
    ↓
  @architect → @backend / @frontend / @database / @devops
    ↓
  @quality → @mobile / @native / @explorer / @git / @analyst
```

Agents may only issue DELEGATION messages **downward** or **sideways** in the hierarchy.
Never delegate upward — escalate via ALERT instead.

---

## 10. Zero Deviation Policy

The following are **unconditional Order violations** that freeze all work immediately:

- Use of `any` TypeScript type
- Use of `console.log` in production code (use `logger` instead)
- Raw SQL strings bypassing Kysely
- Hardcoded secrets, API keys, or credentials in source files
- Direct DB calls in controllers (repositories only)
- Skipping `try-catch` on async operations
- Missing Trace ID in any agent message
