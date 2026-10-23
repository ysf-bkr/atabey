# Atabey MCP — Local Governance & Verification for AI Coding Agents (MCP Server)

[![Version](https://img.shields.io/badge/Version-v{{VERSION}}-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

**Atabey MCP** is the Model Context Protocol server component of the Atabey framework. It
exposes the tool surface your AI host calls, and runs those calls through a multi-layer
governance pipeline (validation, PII masking, discipline, loop detection, token limits,
CRUD governance, risk gating and more), plus vector memory, a risk engine, auto-rollback,
prompt-injection protection and a real-time event stream.

<!-- include: ../fragments/what-is-atabey.md -->

---

## 📋 Package Overview

| Capability | Description |
|-----------|-------------|
| **MCP Tools** | 40 tools across 9 categories: file system, search, messaging, governance, memory, quality, network, orchestration, API catalog (full list below) |
| **Governance Pipeline** | Multi-layer pre/post execution validation: PII masking, risk gate, discipline, loop detection, token limits, license scan, CRUD governance |
| **Memory** | Vector memory (TF-IDF/OpenAI embeddings), project memory, knowledge base |
| **Observability** | Headless HTTP/SSE server (`/mcp/*`) + real-time WebSocket event stream |
| **Auth** | Bearer-token authentication for HTTP/SSE mode |
| **Transport** | Stdio (per-developer) + HTTP/SSE (team server) |

---

## 🚀 Installation

```bash
npm install -g atabey-mcp
```

## Quick Start

```bash
# Stdio mode (default — spawned by your IDE/CLI)
atabey-mcp

# Unified HTTP/SSE server
MCP_TRANSPORT=unified MCP_PORT=5858 atabey-mcp
# MCP SSE:    http://localhost:5858/mcp/sse
# Hermes Bus: ws://localhost:5858/bus
```

---

## 🛠️ MCP Tools (Reference)

### File System (5)
| Tool | Description |
|------|-------------|
| `read_file` | Read file content with line-range support |
| `write_file` | Write content to file, auto-create directories |
| `replace_text` | Surgical string replacement |
| `batch_surgical_edit` | Multi-file batch surgical edits |
| `patch_file` | Line-range based safe file update |

### Search & Exploration (6)
| Tool | Description |
|------|-------------|
| `list_dir` | List directory contents |
| `grep_search` | Recursive regex search |
| `get_project_map` | Tree-view project structure |
| `get_project_gaps` | TODO/FIXME/empty-function scan |
| `get_symbol_outline` | AST-lite symbol map with line ranges |
| `get_task_context` | Targeted context bundle from the CodeGraph (no repo re-scan) |

### API Catalog (2)
| Tool | Description |
|------|-------------|
| `get_api_catalog` | List backend API endpoints (method/path/schemas) |
| `inspect_endpoint` | Full contract + starter payload for one endpoint |

### Framework & System (10)
| Tool | Description |
|------|-------------|
| `run_shell_command` | Restricted shell execution |
| `run_tests` | Execute test suites |
| `get_system_health` | CPU/RAM metrics |
| `check_active_ports` | Active port scan |
| `get_framework_status` | Phase, trace, agent states |
| `read_project_memory` | Read `PROJECT_MEMORY.md` |
| `get_memory_insights` | Memory summary |
| `update_project_memory` | Update memory |
| `orchestrate_loop` | Process Hermes messages |
| `submit_plan` | Submit a DAG plan |

### Control Plane (3)
| Tool | Description |
|------|-------------|
| `acquire_lock` | Lock a shared resource |
| `release_lock` | Release a lock |
| `register_agent` | Register an agent instance |

### Memory & Knowledge (4)
| Tool | Description |
|------|-------------|
| `store_knowledge` | Store to vector memory |
| `search_knowledge` | Search vector memory |
| `delete_knowledge` | Delete a knowledge entry |
| `update_contract_hash` | Update contract hash |

### Messaging & Human (3)
| Tool | Description |
|------|-------------|
| `send_agent_message` | Hermes agent-to-agent message |
| `log_agent_action` | Log to the framework |
| `ask_human` | Ask the developer a question |

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
| `approve_operation` | In-chat risk-gate approval |
| `http_proxy_request` | Secure HTTP proxy (SSRF-guarded) |
| `audit_dependencies` | Unused package audit |

<!-- include: ../fragments/governance-pipeline.md -->

### Pipeline Details

| Layer | Module | Description |
|-------|--------|-------------|
| **Validation** | `zod-to-mcp.ts` | All tool inputs validated against Zod schemas |
| **Governance** | `rules-engine.ts` | Pre-execution argument validation against governance rules |
| **Discipline** | `discipline.ts` | Rate limiting, file-size limits, tool blacklist |
| **Loop Detection** | `loop-detector.ts` | Blocks >10 consecutive same-tool calls, cooldown |
| **Token Limits** | `context/context-optimizer.ts` | Per-provider token/rate ceilings, cooldowns, smart truncation |
| **Auto-Rollback** | `auto-rollback.ts` | Pre-write snapshot, post-write governance scan, automatic restore |
| **Human-in-Loop** | `human-in-loop.ts` | Risk score ≥ 60 requires approval via `approve_operation` |
| **PII Masking** | `pii.ts` | 20+ PII patterns masked before/after handler execution |
| **Injection Protection** | `prompt-injection.ts` | OWASP LLM01: role-play, override, jailbreak detection |

---

## 🧠 Memory & Knowledge

### Vector Memory
```
store_knowledge(content, category, tags) → generateEmbedding() → VectorStore.addEntry()
search_knowledge(query) → generateEmbedding() → VectorStore.search() → cosine similarity sort
```
- **Technology**: SQLite + Float32Array vectors
- **Embedding**: OpenAI `text-embedding-3-small` (1536-dim) or TF-IDF fallback (384-dim)
- **Categories**: ARCHITECTURE, DECISION, CODE_SNIPPET, RULE, TASK_HISTORY

### Knowledge Base
- SQLite persisted with upsert support
- Retrieval via the `search_knowledge` / `read_project_memory` MCP tools
- PII masked on all responses

<!-- include: ../fragments/memory.md -->

---

## 🌐 Unified HTTP/SSE Server

```bash
MCP_TRANSPORT=unified MCP_PORT=5858 atabey-mcp
# MCP SSE:    http://localhost:5858/mcp/sse
# Hermes Bus: ws://localhost:5858/bus
```

| Endpoint | Description |
|----------|-------------|
| `GET /mcp/health` | Server health + active session count |
| `GET /mcp/sse` | MCP-over-SSE transport (remote/team clients) |
| `POST /mcp/messages` | MCP SSE message channel |
| `WS /bus` | Hermes WSS Bus — distributed locks + inter-agent routing |

---

## 🔌 MCP Transport Modes

### Stdio Mode (default — per developer)
```bash
atabey-mcp
# Connects via stdin/stdout JSON-RPC (no network exposure)
```

### HTTP/SSE Mode (team server)
```bash
MCP_TRANSPORT=unified MCP_PORT=5858 atabey-mcp
```
```json
{
  "mcpServers": {
    "atabey": { "url": "http://192.168.1.100:5858/mcp/sse" }
  }
}
```

### Authentication (HTTP/SSE mode)
```bash
export MCP_AUTH_TOKEN="your-secret-token"
export MCP_AUTH_USERS="alice:key1,bob:key2"
```

<!-- include: ../fragments/security-compliance.md -->

<!-- include: ../fragments/token-efficiency.md -->

---

## 🏗️ Architecture

```
packages/atabey-mcp/
├── src/
│   ├── mcp/
│   │   ├── index.ts              # MCP server entry (stdio + unified HTTP/SSE)
│   │   ├── constants.ts          # MCP constants
│   │   ├── middleware/
│   │   │   └── governance.ts     # Tool-call governance pipeline
│   │   ├── routes/               # Unified HTTP routing (/mcp/*)
│   │   ├── resources/            # MCP resource handlers
│   │   ├── tools/                # 40 tool handlers (file_system, search, framework, …)
│   │   ├── modules/              # Canonical engines
│   │   │   ├── compliance/       # PII masking, consent, retention bootstrap
│   │   │   ├── context/          # token/context optimizer, AST scan, memory, workspace
│   │   │   ├── governance/       # policy gate, rules, discipline, loop, risk/HITL, rollback, router
│   │   │   ├── security/         # auth, RBAC permissions, prompt injection, path safety
│   │   │   ├── telemetry/        # metrics + telemetry streamer (token accounting)
│   │   │   └── transport/        # MCP client config, Hermes WSS bus, hub discovery
│   │   └── utils/                # Back-compat re-export shims → modules/* (+ fs, cli, zod-to-mcp)
│   └── shared/                   # audit, constants, logger, pii, retention, storage, types
```

---

## 📦 Dependencies

- **atabey**: Core engine for agent definitions and orchestration
- **atabey-shared**: Shared constants, storage, PII, audit and locking primitives
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **better-sqlite3**: SQLite database
- **zod**: Runtime schema validation
- **chalk**: Terminal UI
- **ws**: WebSocket (Hermes WSS bus)
- **typescript**: Compiler API for AST compliance scanning

<!-- include: ../fragments/related.md -->

<!-- include: ../fragments/license.md -->
