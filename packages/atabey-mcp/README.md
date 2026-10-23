# Atabey MCP — Local Governance & Verification for AI Coding Agents (MCP Server)

[![Version](https://img.shields.io/badge/Version-v0.1.7-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

**Atabey MCP** is the Model Context Protocol server component of the Atabey framework. It
exposes the tool surface your AI host calls, and runs those calls through a multi-layer
governance pipeline (validation, PII masking, discipline, loop detection, token limits,
CRUD governance, risk gating and more), plus vector memory, a risk engine, auto-rollback,
prompt-injection protection and a real-time event stream.

**Atabey** is a **local governance and verification layer for AI coding agents**. It sits
between your codebase and the AI coding assistant you already use (Claude Code, Cursor,
Codex, OpenCode, local LLMs) and connects over the Model Context Protocol (MCP).

It does **not** host an LLM and does **not** write code. Your AI tool writes the code;
Atabey governs which tools it can reach, gates risky operations behind policy and human
approval, and verifies task results with tests and audit evidence.

> **Scope of control:** these controls apply to operations that go through Atabey's MCP
> tools. Native host tools (built-in shell/edit commands) can bypass them unless they are
> disabled or hooked in the host configuration. See
> [Known Limitations](https://github.com/ysf-bkr/atabey/blob/main/docs/limitations.md).


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

> **Auth scope:** HTTP/SSE uses `Authorization: Bearer <token>`. The Hermes `/bus` endpoint
> authenticates with a token in its first `hello` frame and expects `ATABEY_BUS_TOKEN` (or the
> MCP master token). When no token is configured, **both** are open access — local dev only.
> See [Security Policy](https://github.com/ysf-bkr/atabey/blob/main/SECURITY.md).

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

## Multi-Layer Governance Pipeline

Every **MCP tool call** passes through this pipeline:

```
CallToolRequest
    ↓
 1. [VALIDATION]       Zod schema validation
 2. [GOVERNANCE]       validateArgsAgainstRules()
 3. [DISCIPLINE]       enforceDiscipline()
 4. [LOOP DETECTION]   recordAndCheck() + cooldown
 5. [TOKEN LIMITS]     enforceTokenBudgetPreCall() + checkTokenBudget()
 6. [LICENSE]          validateLicenseCompliance()
 7. [AUTO-ROLLBACK]    prepareWrite() snapshot
 8. [HUMAN-IN-LOOP]    RiskEngine.assessTaskRisk() + checkRiskGate()
 9. [PII MASKING]      maskToolArgs() → mask before handler
10. [EXECUTION]        Tool handler runs
11. [POST-VALIDATION]  scanFileForViolations() → rollback if needed
12. [INJECTION PROTECTION] sanitizeResponse()
13. [PII MASKING]      maskToolResult() → mask before returning to AI
    ↓
  Return governed result
```

A control that cannot run **denies the MCP operation** rather than passing it silently.

> This pipeline covers Atabey MCP tools. Native host tools that never call Atabey are
> outside it — see [Known Limitations](https://github.com/ysf-bkr/atabey/blob/main/docs/limitations.md).


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

## 3-Layer Memory System

| Layer | Storage | Technology | Purpose |
|-------|---------|------------|---------|
| **Vector Memory** | SQLite | Local TF-IDF embeddings (cosine similarity); optional OpenAI `text-embedding-3-small` when `OPENAI_API_KEY` is set | Semantic search across project knowledge |
| **Project Memory** | Markdown | `PROJECT_MEMORY.md` | Central project state, synchronized every session |
| **Specialty Memory** | Markdown | `.atabey/memory/specialties/{agent}.md` | Per-agent learned conventions from past tasks |

> **Local by default, not unconditionally local:** if you configure `OPENAI_API_KEY`,
> embedding requests send the embedded text to the OpenAI API. Without a key, Atabey stays
> on-machine and falls back to the local TF-IDF vectorizer (384-dim, zero-padded to 1536 for
> storage).
>
> **Providers are not interchangeable.** OpenAI and TF-IDF vectors live in different semantic
> spaces, so Atabey tags every stored vector with its provider and never scores across
> providers. After switching the key on or off, re-index (`atabey index`) to get comparable
> results; entries from the other provider are skipped rather than ranked with meaningless
> similarity scores.


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

## Security & Compliance

### Rule-based governance

- AST-based compliance scanning + strict TypeScript (**`any` is forbidden**, no `console.*` in production code)
- **Deny-by-default RBAC** permission matrix and protected paths (`.env*`, `.git/`, `.ssh/`, `.atabey/*`, keys)
- **Risk gating** with mandatory human approval when the risk score reaches the configured threshold (default ≥ 60)
- **Prompt-injection mitigation** (OWASP LLM01 aligned) on both input and tool response
- **Secret-leak redaction** on tool output + AES-256-GCM local secret vault
- **HMAC-SHA256** audit chain — tampering is detectable, not impossible
- SSRF-guarded HTTP proxy + Host header DNS-rebinding protection on localhost
- **TLS 1.3 + optional mTLS** when the HTTP/SSE transport is configured with certificates
- **Fail-closed only when enforcement is enabled**: with no auth token and TLS off, the HTTP
  server is open access (local-dev default). See [Security Policy](https://github.com/ysf-bkr/atabey/blob/main/SECURITY.md).

### KVKK / GDPR technical alignment

| Feature | KVKK | GDPR | Status |
|---------|------|------|--------|
| PII Masking (20+ patterns, checksum-validated TCKN) | Art. 4, 5, 12 | Art. 5, 32 | ✅ |
| Data Retention (30–730 days, by category) | Art. 5, 7 | Art. 5, 17 | ✅ |
| Right to Erasure (`atabey audit erase`) | Art. 7 | Art. 17 | ✅ |
| Audit Trail (tamper-evident log chain) | Art. 12 | Art. 30 | ✅ |
| Data Classification | Art. 6 | Art. 9 | ✅ |

> These are technical controls, not a legal compliance declaration or certification.
> Whether your deployment is compliant depends on your configuration and usage; pair with your DPO / counsel.


## Token Efficiency

Atabey keeps token consumption low at three layers — **there is no monetary budget layer**:

1. **Measurement** — every tool call is counted with the real `cl100k_base` BPE tokenizer (input/output split).
2. **Limits** — per-provider context / response / per-minute / per-hour and tool-call rate ceilings (`context-optimizer.ts`). A breach sets a cooldown; hard blocking is opt-in via `ATABEY_TOKEN_BUDGET_ENFORCE=true`.
3. **Savings** — `read_file` responses are smart-truncated (imports/types/signatures preserved), `http_proxy` caches + strips HTML, loop detection stops token-burning loops, and `get_task_context` / `get_symbol_outline` / `get_api_catalog` feed the AI pre-indexed context instead of forcing full-repo scans.

Tune limits with `MCP_MAX_TOKENS_PER_MINUTE`, `MCP_MAX_TOKENS_PER_HOUR`, `MCP_MAX_CONTEXT_TOKENS`, `MCP_MAX_FILE_READ_SIZE`.


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

## 🔗 Related Packages

| Package | Role | Links |
|---------|------|-------|
| **atabey** | Core runtime — CLI, project setup, agents, engines and task verification | [npm](https://www.npmjs.com/package/atabey) · [source](https://github.com/ysf-bkr/atabey/tree/main/packages/atabey) |
| **atabey-mcp** | MCP server — tool surface & governance pipeline | [npm](https://www.npmjs.com/package/atabey-mcp) · [source](https://github.com/ysf-bkr/atabey/tree/main/packages/atabey-mcp) |
| **atabey-shared** | Shared utilities — constants, storage, PII, audit, locks | [npm](https://www.npmjs.com/package/atabey-shared) · [source](https://github.com/ysf-bkr/atabey/tree/main/packages/shared) |

> Full bilingual documentation (TR + EN): **[github.com/ysf-bkr/atabey](https://github.com/ysf-bkr/atabey#readme)**


## License

AGPL-3.0 — Yusuf BEKAR

### Output Exception (Permissive Generated Code Exemption)
All software artifacts, applications (`apps/`), templates, and source code generated, scaffolded, or modified by Atabey tools in your own repositories belong 100% to you and are **exempt** from AGPL-3.0 copyleft obligations.

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
