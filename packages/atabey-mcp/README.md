# [GOV] Atabey MCP — MCP Server for AI Governance & Multi-Agent Platform / Orchestrator

[![Version](https://img.shields.io/badge/Version-v0.0.22-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![MCP Tools](https://img.shields.io/badge/MCP%20Tools-32-blue)](https://github.com/ysf-bkr/atabey)

**Atabey MCP** is the MCP (Model Context Protocol) server component of the Agent Atabey framework. It provides 32 MCP tools, a multi-layer governance pipeline (validation, PII masking, discipline, loop detection, FinOps, CRUD governance, risk gating, and more), vector memory, risk engine, loop detection, FinOps budget management, auto-rollback, prompt injection protection, and a real-time WebSocket dashboard.

---

## 📋 Package Overview

| Capability | Description |
|-----------|-------------|
| **MCP Tools** | 32 tools across 8 categories: file system, search, messaging, governance, memory, quality, network, orchestration |
| **Governance Pipeline** | Multi-layer pre/post execution validation: PII masking, risk gate, discipline, loop detection, FinOps, license scan, CRUD governance, and more |
| **Memory** | Vector memory with TF-IDF/OpenAI embeddings, project memory, knowledge base |
| **Dashboard** | Real-time WebSocket dashboard with 12 live modules |
| **Auth** | Bearer token authentication for HTTP/SSE mode |
| **Multi-Transport** | Stdio (per-developer) + HTTP/SSE (team server) |

---

## 🚀 Installation

```bash
npm install -g atabey-mcp
```

## Quick Start

```bash
# Start MCP server (stdio mode)
atabey-mcp

# Start with dashboard (HTTP/SSE mode)
MCP_TRANSPORT=http MCP_PORT=5858 atabey-mcp
# Dashboard: http://localhost:5858
```

---

## 🛠️ 32 MCP Tools

### File System (6)
| Tool | Description |
|------|-------------|
| `read_file` | Read file content with line range support |
| `view_file` | Alias for read_file |
| `write_file` | Write content to file, auto-create directories |
| `replace_text` | Surgical string replacement |
| `batch_surgical_edit` | Multi-file batch surgical edits |
| `patch_file` | Line-range based safe file update |

### Search & Exploration (4)
| Tool | Description |
|------|-------------|
| `list_dir` | List directory contents |
| `grep_search` | Recursive regex search |
| `get_project_map` | Tree-view project structure |
| `get_project_gaps` | TODO/FIXME/empty function scan |

### Framework & System (10)
| Tool | Description |
|------|-------------|
| `run_shell_command` | Restricted shell execution |
| `run_tests` | Execute test suites |
| `get_system_health` | CPU/RAM metrics |
| `check_active_ports` | Active port scan |
| `get_framework_status` | Phase, trace, agent states |
| `read_project_memory` | Read PROJECT_MEMORY.md |
| `get_memory_insights` | Memory summary |
| `update_project_memory` | Update memory |
| `orchestrate_loop` | Process Hermes messages |
| `submit_plan` | Submit DAG plan |

### Control Plane (3)
| Tool | Description |
|------|-------------|
| `acquire_lock` | Lock shared resource |
| `release_lock` | Release lock |
| `register_agent` | Register agent instance |

### Memory & Knowledge (4)
| Tool | Description |
|------|-------------|
| `store_knowledge` | Store to vector memory |
| `search_knowledge` | Search vector memory |
| `delete_knowledge` | Delete knowledge entry |
| `update_contract_hash` | Update contract hash |

### Messaging & Human (3)
| Tool | Description |
|------|-------------|
| `send_agent_message` | Hermes agent-to-agent message |
| `log_agent_action` | Log to framework |
| `ask_human` | Ask developer a question |

### Compliance & Quality (4)
| Tool | Description |
|------|-------------|
| `mask_pii` | KVKK/GDPR PII masking API |
| `analyze_code_quality` | TypeScript quality analysis |
| `check_architecture_compliance` | Layer boundary check |
| `check_lint` | ESLint execution |

### Operations (3)
| Tool | Description |
|------|-------------|
| `approve_operation` | In-chat risk gate approval |
| `compress_files` | ZIP/TAR/GZIP compression |
| `decompress_files` | Archive extraction |
| `http_proxy_request` | Secure HTTP proxy |
| `audit_dependencies` | Unused package audit |

---

## 🔐 Multi-Layer Governance Pipeline

Every MCP tool call passes through this pipeline:

```
CallToolRequest
    ↓
 1. [VALIDATION]      Zod schema validation
 2. [GOVERNANCE]      validateArgsAgainstRules()
 3. [DISCIPLINE]      enforceDiscipline()
 4. [LOOP DETECTION]  recordAndCheck() + cooldown
 5. [FINOPS]          budgetManager.recordUsage()
 6. [LICENSE]         validateLicenseCompliance()
 7. [AUTO-ROLLBACK]   prepareWrite() snapshot
 8. [HUMAN-IN-LOOP]   RiskEngine.assessTaskRisk() + checkRiskGate()
 9. [PII MASKING]     maskToolArgs() → mask before handler
 10. [EXECUTION]      Tool handler runs
 11. [POST-VALIDATION] scanFileForViolations() → rollback if needed
 12. [INJECTION PROTECTION] sanitizeResponse()
 13. [PII MASKING]    maskToolResult() → mask before returning to AI
    ↓
  Return governed result
```

### Pipeline Details

| Layer | Module | Description |
|-------|--------|-------------|
| **Validation** | `zod-to-mcp.ts` | All tool inputs validated against Zod schemas |
| **Governance** | `rules-engine.ts` | Pre-execution argument validation against governance rules |
| **Discipline** | `discipline.ts` | AI behavior enforcement: rate limiting, file size limits, tool blacklist |
| **Loop Detection** | `loop-detector.ts` | Blocks >10 consecutive same-tool calls, cooldown mechanism |
| **FinOps** | `finops.ts` | Per-agent token/cost tracking, monthly budgets, auto-shutdown |
| **License** | `license-scanner.ts` | Copyleft license detection in write operations |
| **Auto-Rollback** | `auto-rollback.ts` | Pre-write snapshot, post-write governance scan, automatic restore |
| **Human-in-Loop** | `human-in-loop.ts` | Risk score ≥ 60 requires approval via `approve_operation` tool |
| **PII Masking** | `pii.ts` | 20+ PII patterns masked before/after handler execution |
| **Injection Protection** | `prompt-injection.ts` | OWASP LLM01 compliant: role-playing, override, jailbreak detection |

---

## 🧠 Memory & Knowledge

### Vector Memory
```typescript
store_knowledge(content, category, tags) → generateEmbedding() → VectorStore.addEntry()
search_knowledge(query) → generateEmbedding() → VectorStore.search() → cosine similarity sort
delete_knowledge(id) → SQLite DELETE
```

- **Technology**: SQLite + Float32Array vectors
- **Embedding**: OpenAI text-embedding-3-small (1536-dim) or TF-IDF fallback (384-dim)
- **Categories**: ARCHITECTURE, DECISION, CODE_SNIPPET, RULE, TASK_HISTORY

### Knowledge Base
- REST API: `/api/knowledge` (GET list), `/api/knowledge/view?file=X` (GET), `/api/knowledge/update` (POST)
- SQLite persisted with upsert support
- PII masked on all responses

---

## 📊 Dashboard

```bash
MCP_TRANSPORT=http MCP_PORT=5858 atabey-mcp
# Opens at http://localhost:5858
```

| Module | Description | Update |
|--------|-------------|--------|
| 🤖 **Agent Monitor** | AI agent status + tasks | WS (5s) |
| 📨 **Hermes Stats** | Message queue statistics | WS (5s) |
| 💬 **Hermes Messages** | Message queue viewer + filter | WS (5s) |
| 🔐 **Approval Center** | Human-in-the-Loop approvals | WS |
| 📋 **Task Planner** | Task DAG + progress | REST (5s) |
| 📝 **Agent Logs** | Execution logs | WS (5s) |
| ⚠️ **Error Tracker** | Lint/compliance/security errors | WS |
| 🧠 **Memory Insights** | Vector memory search | REST |
| 🛡️ **Compliance** | Quality gate violations | REST (15s) |
| ✅ **Quality Panel** | Code quality analysis | REST |
| 🔌 **Adapters** | Adapter-skill mapping | REST |
| 🔒 **GDPR / KVKK** | PII masking, erasure, audit trail | REST |

---

## 🔌 MCP Transport Modes

### Stdio Mode (Default - Per Developer)
```bash
atabey-mcp
# Connects via stdin/stdout JSON-RPC
```

### HTTP/SSE Mode (Team Server)
```bash
MCP_TRANSPORT=http MCP_PORT=5858 atabey-mcp
```
```json
// Client mcp.json:
{
  "mcpServers": {
    "atabey": {
      "url": "http://192.168.1.100:5858/sse"
    }
  }
}
```

### Authentication (HTTP/SSE Mode)
```bash
export MCP_AUTH_TOKEN="your-secret-token"
export MCP_AUTH_USERS="alice:key1,bob:key2"
```

---

## 🔒 Security Features

### PII Masking (KVKK/GDPR)
| Pattern | Example | Masked |
|---------|---------|--------|
| Email | `user@example.com` | `***@***` |
| Phone | `+90 555 123 45 67` | `***-***-****` |
| TC ID | `12345678901` | `***********` |
| API Key | `sk-abc...xyz` | `***-REDACTED-***` |
| JWT Token | `eyJ...eyJ...` | `***-JWT-REDACTED-***` |
| IP Address | `192.168.1.1` | `***.***.***.***` |
| Credit Card | `4111 1111 1111 1111` | `****-****-****-****` |
| IBAN | `TR33...1326` | `****-IBAN-REDACTED-****` |

### AI Discipline Engine
- **Rate Limiting**: Max 60 calls/minute per agent
- **File Size Limits**: Prevents >1MB files
- **Loop Detection**: Blocks >10 consecutive same-tool calls
- **Cooldown**: Automatic when limits exceeded
- **Injection Protection**: OWASP LLM01 compliant

### Token Economy (FinOps)
- Per-agent token/cost tracking
- Monthly budgets via `ATABEY_BUDGET_MONTHLY`
- Per-agent budgets via `ATABEY_BUDGET_AGENT_MAX`
- 50/80/90/100% alert thresholds
- Auto-shutdown when budget exceeded

---

## 🏗️ Architecture

```
src/
├── mcp/
│   ├── index.ts              # MCP server entry (stdio + HTTP/SSE)
│   ├── constants.ts          # MCP constants
│   ├── declarations.d.ts     # Type declarations
│   ├── resources/            # MCP resource handlers
│   ├── tools/
│   │   ├── definitions.ts    # 32 tool definitions
│   │   ├── schemas.ts        # Zod schemas for all tools
│   │   ├── types.ts          # Tool type definitions
│   │   ├── index.ts          # Tool handler registry
│   │   ├── compliance/       # mask_pii
│   │   ├── control_plane/    # locking, registry
│   │   ├── file_system/      # read, write, replace, patch, batch, compress
│   │   ├── framework/        # status, orchestrate, tests, plan, contract, memory
│   │   ├── memory/           # store, search, delete, insights
│   │   ├── messaging/        # send, log, ask, approve
│   │   ├── network/          # http_proxy
│   │   ├── observability/    # health, ports
│   │   ├── quality/          # analyze, architecture, lint
│   │   ├── search/           # grep, map, gaps, list
│   │   └── shell/            # run_command
│   └── utils/
│       ├── auth.ts           # Bearer token authentication
│       ├── auto-rollback.ts  # Pre-write snapshot + post-write validation
│       ├── cli.ts            # CLI utility functions
│       ├── client-config.ts  # MCP client configuration
│       ├── compliance.ts     # Compliance checking
│       ├── context-optimizer.ts # Token budget optimization
│       ├── discipline.ts     # AI behavior enforcement
│       ├── errors.ts         # Error handling
│       ├── finops.ts         # Token/cost tracking
│       ├── fs.ts             # File system utilities
│       ├── human-in-loop.ts  # Risk gate approval flow
│       ├── license-scanner.ts # License compliance
│       ├── loop-detector.ts  # Infinite loop detection
│       ├── memory.ts         # Framework directory resolution
│       ├── metrics.ts        # Usage metrics
│       ├── permissions.ts    # Permission checking
│       ├── prompt-injection.ts # OWASP LLM01 protection
│       ├── quality.ts        # Code quality analysis
│       ├── rules-engine.ts   # Governance rules
│       ├── security.ts       # Security utilities
│       ├── silent-router.ts  # Semantic agent routing
│       ├── storage.ts        # SQLite storage
│       ├── telemetry-streamer.ts # Telemetry
│       ├── types.ts          # Type definitions
│       ├── web-config.ts     # Web configuration
│       ├── workspace.ts      # Workspace utilities
│       └── zod-to-mcp.ts     # Zod → MCP schema converter
└── shared/
    ├── audit.ts              # Structured audit log
    ├── constants.ts          # Shared constants
    ├── errors.ts             # Error types
    ├── fs.ts                 # File system utilities
    ├── lock.ts               # Distributed locking
    ├── logger.ts             # Structured logging
    ├── pii.ts                # PII masking (20+ patterns)
    ├── retention.ts          # Data retention
    ├── storage.ts            # SQLite storage engine
    ├── string.ts             # String utilities
    └── types.ts              # Branded types
```

---

## 📦 Dependencies

- **atabey**: Core engine for agent definitions and orchestration
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **better-sqlite3**: SQLite database
- **zod**: Runtime schema validation
- **chalk**: Terminal UI
- **ws**: WebSocket for dashboard
- **js-yaml**: YAML parsing for agent definitions

---

## License

AGPL-3.0 — Yusuf BEKAR

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
