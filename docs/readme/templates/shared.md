# Atabey Shared — Shared Infrastructure for the Atabey Monorepo

[![Version](https://img.shields.io/badge/Version-v{{VERSION}}-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey-shared)](https://www.npmjs.com/package/atabey-shared)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Atabey Shared** is the internal utility package of the Atabey monorepo: shared constants
and branded types, security filters (PII, secrets, TLS, policy gate), the SQLite holder and
migrations, structured logging, audit chain, concurrency primitives (locks, job queue,
worker pool) and the sandbox runtime.

It is not a standalone product. It is the common infrastructure used by both `atabey`
(core CLI/runtime) and `atabey-mcp` (MCP server).

---

## 📋 Package Overview

| Module group | Files | Responsibility |
|--------------|-------|----------------|
| **primitives** | `constants`, `types`, `errors`, `fs`, `string`, `time`, `outbound-http` | Framework constants, branded types, error classes, safe fs, TLS-aware outbound HTTP |
| **storage** | `database`, `storage`, `migrations`, `memory-prune` | SQLite holder (singleton), schema migrations, memory pruning |
| **security** | `pii`, `secrets`, `tls`, `policy-gate`, `retention` | PII masking, AES-256-GCM vault, TLS/mTLS, fail-closed PolicyGate, retention |
| **concurrency** | `lock`, `file-lock`, `job-queue`, `worker-pool`, `worker-thread`, `resilience` | Distributed/file locks, DB-backed job queue, worker pool, circuit breaker |
| **sandbox** | `sandbox`, `sandbox-runtime`, `sandbox-fs` | OS sandbox (seatbelt/uid), fail-closed sandboxed file writes |
| **observability** | `logger`, `otel`, `audit`, `audit-chain` | Structured logging, OTel spans, HMAC-signed audit chain |
| **agent** | `agent-identity`, `api-catalog`, `tokenizer` | Signed agent identity, API endpoint catalog, `cl100k_base` tokenizer |
| **lifecycle** | `task-lifecycle` | Task state machine (`SPEC → … → DONE`) with gate checks and handover validation |

> `lifecycle` is an exported **library primitive**: it validates transitions
> (test/coverage/AST gates, maker-checker separation) when you call it. The default
> `atabey init` workflow does not drive task state through it automatically.

---

## 🚀 Installation

Designed as an **internal shared module** for the Atabey monorepo workspace, but installable independently:

```bash
npm install atabey-shared
```

---

## 🧩 Module Structure

The package is organized into focused **module groups**. `src/index.ts` is a barrel
that re-exports everything flat **plus** a `Modules.<Group>` namespace per group; the
flat `atabey-shared/*.js` entry points are kept as thin re-export shims for backward
compatibility.

```
packages/shared/
├── src/
│   ├── index.ts                # Barrel: flat exports + `Modules.<Group>`
│   └── modules/
│       ├── primitives/         # constants, types, errors, fs, string, time, outbound-http
│       ├── storage/            # database, storage, migrations, memory-prune
│       ├── security/           # pii, secrets, tls, policy-gate, retention
│       ├── concurrency/        # lock, file-lock, job-queue, worker-pool, worker-thread, resilience
│       ├── sandbox/            # sandbox, sandbox-runtime, sandbox-fs
│       ├── observability/      # logger, otel, audit, audit-chain
│       ├── agent/              # agent-identity, api-catalog, tokenizer
│       └── lifecycle/          # task-lifecycle (state machine + handover gates)
```

Three import styles are supported:

```typescript
// 1. Flat — stable public API
import { maskText, logger } from "atabey-shared";
import { maskText } from "atabey-shared/pii.js";

// 2. Namespaced by module group
import { Modules } from "atabey-shared";
Modules.Security.maskText("user@example.com");

// 3. Deep module subpath
import { maskText } from "atabey-shared/security/pii.js";
```

---

## ⚙️ Core Modules Detail

### 1. PII Protection (Technical Controls)
The `pii.ts` module scans and redacts sensitive data before it is logged to disk or sent to external LLM providers.
```typescript
import { maskText } from "atabey-shared";

const sanitized = maskText("My phone is +90 555 123 45 67 and email is admin@company.com");
// "My phone is ***-***-**** and email is ***@***"
```

### 2. Distributed Resource Locking
`lock.ts` provides a SQLite-backed `DistributedLock` (server-authoritative, with stale-lock reclaim) that prevents race conditions between parallel agents writing to shared resources. For a lightweight file-based lock, use `AtomicFileLock` from `file-lock.ts`.
```typescript
import { DistributedLock } from "atabey-shared";

DistributedLock.initialize(); // once at startup

const owner = DistributedLock.getLocalOwnerId();
if (DistributedLock.acquire("PROJECT_MEMORY.md", owner, { ttlMs: 10000, reason: "memory sync" })) {
    try {
        // safe region: write the shared resource
    } finally {
        DistributedLock.release("PROJECT_MEMORY.md", owner);
    }
}
```

### 3. Structured Logger
Structured logger wrapping `process.stdout`/`process.stderr`, with file logging and JSON output.
```typescript
import { logger, LogLevel } from "atabey-shared";

logger.configure({ minLevel: LogLevel.DEBUG, jsonFormat: true, logFile: "./.atabey/logs/system.log" });
logger.info("Database migration completed", { durationMs: 142 });
```

### 4. Branded Types
Compile-time validation for workspace ID primitives to prevent mixing agent names, message IDs and task IDs.
```typescript
import { AgentID, TaskID, asAgentID, asTaskID } from "atabey-shared";

const agent: AgentID = asAgentID("@backend");
const task: TaskID = asTaskID("TASK-102");
```

---

## 📦 Dependencies

- **js-tiktoken**: `cl100k_base` BPE tokenizer for token accounting
- **better-sqlite3**, **chalk** _(peer)_: storage and terminal styling

<!-- include: ../fragments/related.md -->

<!-- include: ../fragments/license.md -->
