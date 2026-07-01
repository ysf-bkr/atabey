# atabey-shared

**Shared utility modules** for Atabey — AI Governance & Multi-Agent Platform / Orchestrator.

This package contains the common low-level utilities, types, and helpers used across `atabey` and `atabey-mcp`.

[![npm](https://img.shields.io/npm/v/atabey-shared)](https://www.npmjs.com/package/atabey-shared)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

## What's Included

| Module      | Purpose |
|-------------|---------|
| `audit`     | Audit logging utilities |
| `constants` | Framework-wide constants |
| `database`  | SQLite / Kysely helpers |
| `errors`    | Structured error classes |
| `fs`        | File system utilities |
| `lock`      | File-based locking primitives |
| `logger`    | Structured logging (pino-based) |
| `pii`       | PII detection & masking |
| `retention` | Data retention policies |
| `string`    | String & template helpers |
| `types`     | Shared TypeScript types |

## Installation

This package is **not intended for direct use** outside the Atabey ecosystem.

```bash
npm install atabey-shared
```

It is automatically installed as a dependency of `atabey` and `atabey-mcp`.

## Usage (internal)

```ts
import { maskPII, createAuditEntry, AtabeyLock } from 'atabey-shared';
```

## License

AGPL-3.0 — see [LICENSE](https://github.com/ysf-bkr/atabey/blob/main/LICENSE) in the monorepo.

## Links

- [GitHub](https://github.com/ysf-bkr/atabey)
- [atabey on npm](https://www.npmjs.com/package/atabey)
- [atabey-mcp on npm](https://www.npmjs.com/package/atabey-mcp)
