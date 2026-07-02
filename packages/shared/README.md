# [GOV] Atabey Shared — Core Utility Library for AI Governance Platform

[![Version](https://img.shields.io/badge/Version-v0.0.22-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey-shared)](https://www.npmjs.com/package/atabey-shared)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Atabey Shared** is the foundational utility package of the Agent Atabey framework. It provides the shared codebase, data structures, constants, security filters, database holders, logging layers, and locking mechanisms used by both `atabey` (Core CLI/Orchestrator) and `atabey-mcp` (MCP Server).

---

## 📋 Package Overview

| Module | Files | Core Responsibilities |
|--------|-------|-----------------------|
| **PII Masking** | `pii.ts` | Regex-based sanitization of 20+ sensitive patterns (emails, phones, credit cards, IP addresses, JWT tokens, API keys) |
| **Distributed Locking** | `lock.ts` | Multi-process file-based lock implementation with stale lock detection (10s TTL) and retry backoff |
| **Enterprise Logger** | `logger.ts` | Multi-destination structured logging (Stdout/Stderr + local files) supporting min-level and JSON formatting |
| **Data Retention** | `retention.ts` | KVKK/GDPR-compliant telemetry and log pruning based on 30-day and 90-day retention policies |
| **Audit Logs** | `audit.ts` | Unified JSON audit trail capturing agent actions, timestamps, trace IDs, and results |
| **Error Handling** | `errors.ts` | Custom error classes (`AtabeyBaseError`, `LockError`, `ComplianceError`) preserving stack traces |
| **Constants & Types** | `constants.ts`, `types.ts` | Centralized constants (Phase paths, candidate directories, MCP constants) and strictly branded types |
| **File System** | `fs.ts` | Safe file write wrapper with automatic parent directory creation and encoding validation |
| **Database Holder** | `database.ts` | Singleton SQLite database holder for shared workspace storage |

---

## 🚀 Installation

This package is designed as an **internal shared module** for the Atabey monorepo workspace, but it can be installed independently if needed:

```bash
npm install atabey-shared
```

---

## ⚙️ Core Modules Detail

### 1. PII Protection (KVKK/GDPR Compliance)
The `pii.ts` module scans and redacts sensitive data before it is logged to disk or sent to external LLM providers, ensuring absolute data privacy.
```typescript
import { maskText } from "atabey-shared";

const sensitiveInput = "My phone is +90 555 123 45 67 and email is admin@company.com";
const sanitizedText = maskText(sensitiveInput);
console.log(sanitizedText);
// Output: "My phone is ***-***-**** and email is ***@***"
```

### 2. Distributed Resource Locking
The `lock.ts` module prevents race conditions between parallel running agents writing to shared resources (e.g. `PROJECT_MEMORY.md`).
```typescript
import { AtabeyLock } from "atabey-shared";

const lock = new AtabeyLock("project-memory", { ttlMs: 10000, retryCount: 3 });

try {
    const acquired = await lock.acquire();
    if (acquired) {
        // Safe region: write to file
    }
} finally {
    await lock.release();
}
```

### 3. Enterprise Logger
Structured logger wrapping `process.stdout` and `process.stderr` supporting log file logging and JSON output format.
```typescript
import { logger, LogLevel } from "atabey-shared";

logger.configure({
    minLevel: LogLevel.DEBUG,
    jsonFormat: true,
    logFile: "./.atabey/logs/system.log"
});

logger.info("Database migration completed", { durationMs: 142 });
```

### 4. Branded Types
Ensures compile-time validation for workspace ID primitives to prevent mixing up agent names, message IDs, and task IDs.
```typescript
import { AgentID, TaskID, asAgentID, asTaskID } from "atabey-shared";

const agent: AgentID = asAgentID("@backend");
const task: TaskID = asTaskID("TASK-102");
```

---

## 📦 Dependencies

- **better-sqlite3**: SQLite database engine for storage shims
- **typescript**: Type safety enforcement

---

## License

AGPL-3.0 — Yusuf BEKAR

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
