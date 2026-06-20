# Agent Atabey — MCP Server (`atabey-mcp`)

[![Version](https://img.shields.io/npm/v/atabey-mcp.svg)](https://www.npmjs.com/package/atabey-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/dt/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)

The **Model Context Protocol (MCP)** server for [Agent Atabey](https://www.npmjs.com/package/atabey).

This package bridges AI assistants (Claude Code, Gemini CLI, Cursor, Codex, Antigravity) with your local project environment. Provides **34+ secure, audited, type-safe tools** across 10 categories + **5 Invisible AI Governance Layers** that run transparently behind every tool call. Includes the **Hermes Control Center** dashboard with 12+ live modules.

> **Main Package:** [`atabey`](https://www.npmjs.com/package/atabey) (CLI + Framework)

---

## 📋 Table of Contents

- [Installation](#installation)
- [How It Works](#how-it-works)
- [Invisible AI Governance Layer](#-invisible-ai-governance-layer)
- [Hermes Control Center Dashboard](#hermes-control-center-dashboard)
- [Provided Tools (34)](#provided-tools-34)
- [API Endpoints](#-api-endpoints)
- [MCP Configuration](#mcp-configuration)
- [Environment Variables](#-environment-variables)
- [Development](#development)
- [Testing](#testing)
- [Enterprise Governance Checklist](#-enterprise-governance-checklist)

---

## Installation

```bash
# Run with npx (no install needed)
npx atabey-mcp

# Global install
npm install -g atabey-mcp

# Add to project
npm install atabey-mcp
```

---

## How It Works

Atabey MCP Server operates as an **Invisible AI Governance Middleware** between your AI assistant and your project. The developer never writes `@agent` commands — Atabey silently detects intent, injects governance rules, and enforces enterprise policies at the tool level.

```
AI Assistant (Claude Code / Gemini CLI / Cursor)
       │
       ▼  MCP Protocol (Surgical Tool Calls & Interception)
       │
┌──────────────────────────────────────────────────────────────┐
│  Atabey MCP Server (Invisible AI Governance Middleware)      │
│                                                              │
│  ├── 1. Silent Semantic Router (Intent Detection &           │
│  │      Rules Injection — no @agent needed)                  │
│  ├── 2. Token Circuit Breaker + FinOps Budget (Cost &        │
│  │      Context Window Governance)                           │
│  ├── 3. Loop Detector (6 Pattern Prevention — Cooldown)      │
│  ├── 4. License Scanner (SPDX / Copyleft Blocking)           │
│  ├── 5. Pre-Write Snapshot + Post-Execution AST Scan         │
│  │      (Auto-Rollback + Regenerate Instruction)             │
│  └── 6. Asynchronous Telemetry Streamer (Edge → Cloud)       │
└──────────────────────────────────────────────────────────────┘
       │
       ▼ Approved, Audited & Compliant Operations
       │
Your Local Project Environment (Files, Git, Sandboxed Shell)
```

When you type `Create login API` (without any `@agent` command):
1. **Silent Semantic Router** detects the intent from natural language
2. **Token Circuit Breaker** checks context window budget
3. **FinOps** verifies team/agent budget is not exceeded
4. **Loop Detector** ensures no infinite loop pattern
5. **License Scanner** validates generated code for copyleft
6. **Auto-Rollback** captures pre-write snapshot
7. **Risk Gate** blocks destructive operations (DROP, DELETE)
8. Tool executes → **Post-Execution AST Scan** validates output
9. If violation found → **auto-rollback + regenerate instruction** sent to AI
10. **Telemetry Streamer** asynchronously sends masked events to enterprise

**No @agent commands. No separate terminal. No CLI commands for daily use.**

---

## Hermes Control Center Dashboard

The MCP package includes a real-time WebSocket dashboard with 12 live modules:

| Module | Description | Update |
|--------|-------------|--------|
| 🤖 **Agent Monitor** | 13 AI agent status + live tasks | WS (5s) |
| 📨 **Hermes Stats** | Message queue statistics | WS (5s) |
| 💬 **Hermes Messages** | Agent message queue + filtering | WS (5s) |
| 🔐 **Approval Center** | Human-in-the-Loop approvals | WS |
| 📋 **Task Planner** | Task DAG + progress tracking | REST (5s) |
| 📝 **Agent Logs** | Execution logs + agent filter | WS (5s) |
| ⚠️ **Error Tracker** | Lint/compliance/security errors | WS |
| 🧠 **Memory Insights** | Vector memory search | REST |
| 🛡️ **Compliance** | Quality gate violations | REST (15s) |
| ✅ **Quality Panel** | Code quality analysis | REST |
| 🔌 **Adapters** | Adapter-skill mapping | REST |
| 📊 **Dashboard** | System overview | Mixed |

```bash
# Start dashboard (default port: 5858)
npx atabey dashboard
# Browser: http://localhost:5858
```

### Dashboard Components

```
framework-mcp/dashboard/src/
├── App.tsx                    # Main app, routing and WS management
├── main.tsx                   # React entry point
├── styles.ts                  # PandaCSS styles
├── components/
│   ├── AdapterSkillsPanel.tsx # Adapter skill mapping
│   ├── AgentMonitor.tsx       # Agent status monitoring
│   ├── ApprovalCenter.tsx     # Approval center
│   ├── CompliancePanel.tsx    # Compliance control panel
│   ├── ErrorTracker.tsx       # Error tracking
│   ├── FinOpsPanel.tsx        # Team & Agent budget management (New)
│   ├── GatewayPanel.tsx       # LLM Gateway management
│   ├── HermesBrokerView.tsx   # Hermes message queue
│   ├── HermesStats.tsx        # Hermes statistics
│   ├── LicensePanel.tsx       # SPDX license compliance tracker (New)
│   ├── LogViewer.tsx          # Log viewer
│   ├── LoopDetectorPanel.tsx  # Multi-pattern loop prevention & cooldowns (New)
│   ├── MemoryInsights.tsx     # Memory insights
│   ├── PlanViewer.tsx         # Plan viewer
│   ├── QualityPanel.tsx       # Quality panel
│   └── TelemetryPanel.tsx     # Edge-to-Cloud sync monitoring (New)
└── hooks/
    ├── useApi.ts              # REST API hook
    └── useWS.ts               # WebSocket hook
```

---

## Provided Tools (34)

### File System

| Tool | Description | Zod Validation |
|------|-------------|----------------|
| `read_file` | Read file content with line range | ✅ |
| `write_file` | Atomic file write with directory creation | ✅ |
| `replace_text` | Surgical text replacement | ✅ |
| `patch_file` | Safe line-range update | ✅ |
| `batch_surgical_edit` | Multi-file batch editing | ✅ |

### Search & Exploration

| Tool | Description |
|------|-------------|
| `list_dir` | List directory contents |
| `grep_search` | Recursive regex search |
| `get_project_map` | Project structure tree |
| `get_project_gaps` | Find TODOs, FIXMEs, gaps |

### Control Plane

| Tool | Description |
|------|-------------|
| `acquire_lock` | Acquire resource lock |
| `release_lock` | Release resource lock |
| `register_agent` | Register agent instance |

### Messaging (Hermes Protocol)

| Tool | Description |
|------|-------------|
| `send_agent_message` | Hermes protocol messaging |
| `log_agent_action` | Log agent actions |
| `ask_human` | Wait for human input |

### Memory

| Tool | Description |
|------|-------------|
| `read_project_memory` | Read central memory |
| `update_project_memory` | Update memory section |
| `get_memory_insights` | Memory summaries |
| `store_knowledge` | Store vector knowledge |
| `search_knowledge` | Search vector memory |
| `delete_knowledge` | Delete knowledge entry |

### Framework & Quality

| Tool | Description |
|------|-------------|
| `get_framework_status` | Framework status |
| `run_tests` | Run test suites |
| `check_lint` | Run ESLint |
| `update_contract_hash` | Sync contract hash |
| `orchestrate_loop` | Process Hermes messages |
| `submit_plan` | Submit DAG task plan |
| `audit_dependencies` | Audit package.json |
| `get_system_health` | CPU/RAM metrics |
| `check_active_ports` | Port monitoring |

### Observability

| Tool | Description |
|------|-------------|
| `get_health` | System health |
| `check_ports` | Port status |

### Shell

| Tool | Description |
|------|-------------|
| `run_shell_command` | Execute shell commands |

---

## LLM Gateway Tools

### `llm_gateway_query`

Sends queries to LLM providers with load balancing, circuit breaker, and rate limiting.

**Parameters:**
- `provider` (string): LLM provider name (`openai`, `anthropic`, `google`, `groq`, `ollama`)
- `model` (string): Model name
- `messages` (array): Chat messages
- `options` (object, optional): Temperature, max tokens, etc.

### `llm_gateway_status`

Returns gateway status and provider statistics.

**Supported Providers:**

| Provider | Models | Status |
|----------|--------|--------|
| OpenAI | GPT-4, GPT-4o, o3, o4-mini | ✅ |
| Anthropic | Claude Opus 4.5, Sonnet 4.5, Haiku 3.5 | ✅ |
| Google | Gemini 2.5 Pro, Flash, Flash-Lite | ✅ |
| Groq | Llama, Mixtral | ✅ |
| Ollama | Local models | ✅ |

---

## MCP Configuration

### Claude Code

Add to your `mcp.json`:

```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["atabey-mcp"],
      "env": {
        "ATABEY_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ATABEY_PROJECT_ROOT` | Project root directory | `process.cwd()` |
| `PORT` or `DASHBOARD_PORT` | Dashboard port | `5858` |
| `NODE_ENV` | Environment (production/development) | `development` |

### Gemini CLI

```bash
gemini config set mcpServers.atabey.command "npx"
gemini config set mcpServers.atabey.args "[\"atabey-mcp\"]"
```

### Cursor

```json
// .cursor/mcp.json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["atabey-mcp"]
    }
  }
}
```

## 🔮 Invisible AI Governance Layer

Atabey MCP Server includes **5 invisible governance layers** that run transparently behind every tool call. The developer's AI CLI never sees them — they operate silently at the MCP middleware layer.

```
[ AI CLI Sohbet Akışı ]
         │
         ├──> [1. Token Circuit Breaker] ──> Budget & File Size Limits
         ├──> [2. Silent Semantic Router] ──> Background Agent Selection & Prompt Injection
         ├──> [3. CLI Human-in-the-Loop] ──> In-Chat Risk Approval
         ├──> [4. Post-Execution AST Scanner] ──> Governance Scan + Auto-Rollback
         └──> [5. Asynchronous Telemetry Streamer] ──> Local SQLite → Enterprise Server
```

| Layer | Component | What It Does |
|-------|-----------|-------------|
| **1. Token Circuit Breaker** | `context-optimizer.ts` | Scans context window in real-time. Truncates oversized files (>100KB). Enforces `MAX_TOKENS_PER_CALL`, per-minute/hour budgets. Prevents context poisoning. |
| **2. Silent Semantic Router** | `silent-router.ts` | Analyzes natural language WITHOUT requiring `@agent` commands. Silently injects the right agent's system prompt (e.g., @security rules when you type "make this secure"). |
| **3. CLI Human-in-the-Loop** | `human-in-loop.ts` | Blocks destructive operations (DROP, DELETE, deploy scripts). Creates in-chat `[Onaylıyor musunuz? Y/N]` approval requests — no browser/terminal switch needed. |
| **4. Post-Execution AST Scanner** | `discipline.ts` + `rules-engine.ts` + `auto-rollback.ts` | Scans AI-generated code via AST before saving. Blocks `any` types, console.log, hardcoded secrets. **Auto-rollback + regenerate** instruction sent back to AI. |
| **5. License/Copyright Scanner** | `license-scanner.ts` | Detects GPL/AGPL copyleft licenses in AI output. Blocks code with restricted licenses, warns about attribution requirements. |
| **6. Loop Detector** | `loop-detector.ts` | Detects 6 loop patterns: consecutive same tool, file churn, oscillation (A→B→A→B), content identity, rate limits. Automatic cooldown. |
| **7. FinOps Budget Enforcement** | `finops.ts` | Team/agent-based monthly budget in USD. Auto-blocks when budget exceeded. Syncs with enterprise server for centralized policy. |
| **8. Asynchronous Telemetry** | `telemetry-streamer.ts` | Streams masked governance events to enterprise server via HTTPS/WS. Batch processing, retry with backoff, PII masking before transmission. |

### Enforcement Pipeline (Per Tool Call) — 13 Aşama

Every tool call passes through this **13-stage invisible pipeline**. The critical insight is **when** code is scanned relative to disk writes:

```
                         TOOL CALL FLOW
                    ──────────────────────►

┌─────────────────────────────────────────────────────────────────────────┐
│  PRE-EXECUTION (Validation Gates — No Disk Access)                     │
│                                                                         │
│  ┌─ 1. PII Arg Masking ────────────────────────────────────────────┐   │
│  │  maskToolArgs() → TC Kimlik, email, kredi kartı maskelenir       │   │
│  ├─ 2. Token Economy ──────────────────────────────────────────────┤   │
│  │  Metrics.logUsage() → tahmini maliyet hesaplanır                │   │
│  ├─ 3. Governance Pre-check ───────────────────────────────────────┤   │
│  │  validateArgsAgainstRules() → any type, console.log kontrolü    │   │
│  ├─ 4. Loop Detection ─────────────────────────────────────────────┤   │
│  │  recordAndCheck() → 6 pattern (consecutive, oscillation, vb.)   │   │
│  ├─ 5. FinOps Budget ──────────────────────────────────────────────┤   │
│  │  budgetManager.recordUsage() → bütçe aşımı kontrolü             │   │
│  ├─ 6. License Scan ───────────────────────────────────────────────┤   │
│  │  validateLicenseCompliance() → GPL/AGPL copyleft blocking       │   │
│  ├─ 7. Auto-Rollback Snapshot ─────────────────────────────────────┤   │
│  │  prepareWrite() → ★ DİSK OKUMA: dosyanın mevcut hali yedeklenir │   │
│  ├─ 8. Risk Gate (Human-in-Loop) ──────────────────────────────────┤   │
│  │  assessTaskRisk() → DROP/DELETE varsa in-chat onay beklenir     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ★ TOOL EXECUTION ★ ──────────────────────────────────────────────►   │
│  handler() → ★ DİSK YAZMA: AI kodu diske yazar                      │   │
│                                                                         │
│  POST-EXECUTION (Validation Gates — Disk Already Written)              │
│                                                                         │
│  ┌─ 9. Post-Execution Rollback ────────────────────────────────────┐   │
│  │  scanFileForViolations() → ★ DİSK TARAMA: yazılan dosyada       │   │
│  │  any, console.log, hardcoded secret var mı?                     │   │
│  │  ┌─ İhlal Yok → devam                                           │   │
│  │  └─ İhlal Var → ★ DİSK GERİ AL: snapshot'a dön + AI'ya         │   │
│  │     regenerate talimatı gönder (tool response olarak)            │   │
│  ├─10. Discipline + Governance Post-check ─────────────────────────┤   │
│  │  validateResponse() → response boyutu, binary içerik kontrolü   │   │
│  ├─11. Context Optimizer ──────────────────────────────────────────┤   │
│  │  checkTokenBudget() → token limit aşımı uyarısı                 │   │
│  ├─12. Silent Router Injection ────────────────────────────────────┤   │
│  │  buildSilentContext() → governance kuralları response'a eklenir │   │
│  ├─13. PII Result Masking ────────────────────────────────────────┤   │
│  │  maskToolResult() → AI'ya dönen response maskelenir            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

**Kritik Zamanlama Notları:**
- **Adım 7 (Snapshot):** Diskten OKUMA yapar, dosyanın mevcut halini yedekler. Henüz yazma yok.
- **Adım ★ (Execution):** AI kodu diske YAZAR. Bu noktada dosya değişmiştir.
- **Adım 9 (Rollback):** Diskteki yeni içeriği TARAR. İhlal varsa → snapshot'a geri döner (tekrar DİSK YAZMA).
- **Adım 12 (Injection):** Governance kuralları response'a enjekte edilir, AI bir sonraki adımda kurallara uyar.
- **Adım 13 (Masking):** AI'ya dönen son response PII maskelenir — pipeline'ın son adımı.

---

## 📡 API Endpoints

The unified server exposes these REST API endpoints (all under `http://localhost:{PORT}/api/`):

### Core Governance Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/governance` | GET | Combined governance stats (discipline, budget, loops, rollback, telemetry) |
| `/api/discipline` | GET | AI discipline stats per agent |
| `/api/metrics` | GET | Token economy — cost by agent/action, total spend |
| `/api/compliance` | GET | Corporate compliance scan results (any, console) |
| `/api/quality` | GET | Code quality analysis |

### New Enterprise Governance Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/telemetry` | GET | Telemetry streamer status + config |
| `/api/loop-detector` | GET | Loop detection stats (all agents) |
| `/api/loop-detector?agent=NAME` | GET | Loop stats for specific agent |
| `/api/loop-detector/clear/{agent}` | POST | Clear cooldown for an agent |
| `/api/finops` | GET | Budget state (team spend, period, blocked status) |
| `/api/finops/check?agent=NAME` | GET | Check budget for an agent |
| `/api/finops/reset` | POST | Reset budget period |
| `/api/license?path=PATH&content=CODE` | GET | Scan code for license violations |
| `/api/rollback` | GET | Auto-rollback snapshot stats |

### Legacy Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Server health check |
| `/api/status` | GET | Framework status |
| `/api/memory` | GET | Project memory |
| `/api/memory/search?q=QUERY` | GET | Vector memory search |
| `/api/agents` | GET | Agent list |
| `/api/messages` | GET | Pending Hermes messages |
| `/api/hermes/stats` | GET | Message queue stats |
| `/api/tasks` | GET | Task planner |
| `/api/logs` | GET | Execution logs |
| `/api/approvals` | GET | Pending approvals |
| `/api/approve/{traceId}` | POST | Approve operation |
| `/api/reject/{traceId}` | POST | Reject operation |
| `/api/audit` | GET | Audit log (GDPR/KVKK) |
| `/api/audit/erase` | POST | Right to erasure |
| `/api/mcp/sessions` | GET | Active MCP sessions |
| `/api/adapters/skills` | GET | Adapter-skill mapping |

---

## 🌍 Environment Variables

### Core Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ATABEY_PROJECT_ROOT` | Project root directory | `process.cwd()` |
| `ATABEY_FRAMEWORK_DIR` | Framework directory | `.atabey` |
| `MCP_PORT` | Server port | `5858` |
| `MCP_HOST` | Server host | `0.0.0.0` |
| `MCP_TRANSPORT` | Transport mode (`unified` / `stdio`) | `unified` |

### Security & Authentication

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_AUTH_TOKEN` | API key for authentication | (open access) |
| `MCP_AUTH_USERS` | Comma-separated user:token pairs | (none) |

### Token Budget & Rate Limiting

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_MAX_TOKENS_PER_CALL` | Max tokens per response | `4000` |
| `MCP_MAX_TOKENS_PER_MINUTE` | Max tokens per minute | `20000` |
| `MCP_MAX_TOKENS_PER_HOUR` | Max tokens per hour | `100000` |
| `MCP_MAX_FILE_READ_SIZE` | Max file read size (bytes) | `102400` (100KB) |
| `MCP_MAX_CALLS_PER_MINUTE` | Max tool calls per minute | `60` |
| `MCP_MAX_TOTAL_CALLS` | Max total calls per session | `500` |

### AI Discipline & Loop Detection

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_RESTRICTED_TOOLS` | Blacklisted tools | `run_shell_command,check_active_ports` |
| `MCP_AGENT_TOOL_WHITELIST` | Per-agent tool whitelist | (none) |
| `MCP_LOOP_MAX_CONSECUTIVE` | Max consecutive same tool calls | `10` |
| `MCP_LOOP_MAX_FILE_CHURN` | Max writes to same file | `5` |
| `MCP_LOOP_COOLDOWN_MS` | Loop cooldown duration | `30000` (30s) |

### FinOps (Budget Management)

| Variable | Description | Default |
|----------|-------------|---------|
| `ATABEY_BUDGET_ENABLED` | Enable budget enforcement | `false` |
| `ATABEY_BUDGET_TEAM` | Team name for budget grouping | `default` |
| `ATABEY_BUDGET_MONTHLY` | Monthly budget in USD | `0` (unlimited) |
| `ATABEY_BUDGET_AGENT_MAX` | Max spend per agent in USD | `0` (unlimited) |
| `ATABEY_BUDGET_SYNC_URL` | Enterprise server URL for budget sync | (none) |
| `ATABEY_COST_PER_1K_TOKENS` | Cost per 1K tokens (USD) | `0.003` |

### Telemetry & Enterprise Streaming

| Variable | Description | Default |
|----------|-------------|---------|
| `ATABEY_TELEMETRY_ENABLED` | Enable telemetry streaming | `false` |
| `ATABEY_SERVER_URL` | Enterprise server URL | (none) |
| `ATABEY_SERVER_TOKEN` | Auth token for enterprise server | (none) |
| `ATABEY_TELEMETRY_BATCH_SIZE` | Events per batch | `50` |
| `ATABEY_TELEMETRY_RATE_LIMIT` | Max events per minute | `200` |
| `ATABEY_TELEMETRY_WS` | Use WebSocket for streaming | `false` |
| `ATABEY_TELEMETRY_FALLBACK_DIR` | Local fallback directory for offline queue | `.atabey/telemetry/` |

### License Scanner

| Variable | Description | Default |
|----------|-------------|---------|
| `ATABEY_LICENSE_SCAN` | Enable license scanning | `true` |
| `ATABEY_BLOCK_COPYLEFT` | Block copyleft licenses | `true` |
| `ATABEY_LICENSE_BLOCKLIST` | Blocked SPDX identifiers | `GPL-3.0,AGPL-3.0,GPL-2.0` |
| `ATABEY_LICENSE_ALLOWLIST` | Allowed SPDX identifiers | `MIT,Apache-2.0,BSD-*,ISC,CC0-1.0,Unlicense` |

### Human-in-the-Loop

| Variable | Description | Default |
|----------|-------------|---------|
| `MCP_HIGH_RISK_THRESHOLD` | Risk score for blocking (0-100) | `60` |
| `MCP_MEDIUM_RISK_THRESHOLD` | Risk score for warning (0-100) | `30` |
| `MCP_APPROVAL_TIMEOUT` | Approval timeout in seconds | `300` (5 min) |

---

## 🏢 Enterprise Governance Checklist

This checklist maps to the complete operational framework for running Atabey as an **Invisible AI Governance Platform** in enterprise environments.

### 🔲 Local (Developer Machine)

| # | Check | Component | How to Test |
|---|-------|-----------|-------------|
| `[ ]` | **1. CLI Entegrasyon Sağlığı** | `index.ts` (stdio) | Start Claude Code / Gemini CLI → verify `mcp.json` auto-connects via stdio transport |
| `[ ]` | **2. Dosya Okuma Boyut Sınırı** | `context-optimizer.ts` | Try reading a >100KB file → verify auto-truncation with `[TRUNCATED]` header |
| `[ ]` | **3. Döngü Kilidi** | `loop-detector.ts` | Call same tool 10× consecutively → verify cooldown message |
| `[ ]` | **4. Eşzamanlı Çalışma Kilidi** | `src/shared/lock.ts` | Two terminals, same file → second gets `DistributedLock` block |
| `[ ]` | **5. Yerel Veri Katılığı** | `storage.ts` + SQLite | Check `.atabey/memory/` and `atabey.db` for real data (no mocks) |
| `[ ]` | **6. Hata Yutma Denetimi** | All `catch {}` blocks | Run `atabey check` → verify no silent errors |

### 🔲 Server (Enterprise / Central Governance)

| # | Check | Component | How to Test |
|---|-------|-----------|-------------|
| `[ ]` | **1. Kimlik Doğrulama** | `auth.ts` | Request without `Authorization: Bearer` → verify `401 Unauthorized` |
| `[ ]` | **2. Katı Bütçe Sınırlandırması** | `finops.ts` | Set `ATABEY_BUDGET_MONTHLY=10` → spend $10 → verify auto-block |
| `[ ]` | **3. KVKK/GDPR Maskeleme** | `pii.ts` | Send TC Kimlik No in chat → verify `***********` in logs |
| `[ ]` | **4. Unutulma Hakkı** | `audit.ts` | POST `/api/audit/erase` with `KVKK-RIGHT-TO-ERASURE` → verify data deletion |
| `[ ]` | **5. Merkezi Raporlama** | `telemetry-streamer.ts` | 5 developers working → verify consolidated dashboard via WebSocket |
| `[ ]` | **6. Lisans Denetimi** | `license-scanner.ts` | AI generates GPL code → verify block + regenerate instruction |

---

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Build dashboard
npm run build --prefix dashboard

# Development mode
npm run dev
```

### Project Structure

```
framework-mcp/
├── src/
│   ├── index.ts            # MCP Server (Stdio Transport)
│   ├── constants.ts        # MCP-specific constants
│   ├── declarations.d.ts   # Type declarations
│   ├── resources/          # MCP Resources
│   ├── tools/
│   │   ├── definitions.ts  # Tool definitions
│   │   ├── index.ts        # Tool handlers
│   │   ├── schemas.ts      # Zod validation schemas
│   │   ├── types.ts        # Tool types
│   │   ├── control_plane/  # Lock, Registry
│   │   ├── file_system/    # Read, Write, Edit, Patch
│   │   ├── framework/      # Status, Test, Orchestrate
│   │   ├── gateway/        # LLM Gateway
│   │   ├── memory/         # Knowledge management
│   │   ├── messaging/      # Hermes messaging
│   │   ├── observability/  # Health, Port
│   │   ├── quality/        # Code quality
│   │   ├── search/         # Grep, Map, Gap
│   │   └── shell/          # Command execution
│   └── utils/              # Utilities
├── dashboard/              # React Dashboard
└── tests/                  # Tests
```

---

## Testing

```bash
# Run all tests
npm test

# Run specific test
npx vitest run tests/tools/file_system/file_system_tools.test.ts
```

### Current Test Files

| Test File | Scope | Status |
|-----------|-------|--------|
| `file_system/file_system_tools.test.ts` | Basic file system tools | ✅ |
| `file_system/compliance-risk.test.ts` | Compliance risk analysis | ✅ |
| `file_system/permissions.test.ts` | Permission controls | ✅ |
| `messaging/send_message.test.ts` | Hermes messaging | ✅ |
| `quality/check_lint.test.ts` | ESLint validation | ✅ |
| `shell/run_command.test.ts` | Shell commands | ✅ |
| `utils/telemetry-streamer.test.ts` | Batch processing, exponential backoff, PII masking | ✅ 12 passed |
| `utils/license-scanner.test.ts` | SPDX validation, copyleft (GPL) blocking | ✅ 11 passed |
| `utils/finops.test.ts` | Team/Agent hard-cap budget enforcement | ✅ 12 passed |
| `utils/auto-rollback.test.ts` | Pre-write snapshot, violation detection, auto-rollback | ✅ 12 passed |
| `utils/loop-detector.test.ts` | 6 loop patterns, file churn, oscillation detection | ✅ 14 passed |

> **Note:** Gateway module tests are in the main package: `tests/modules/gateway/`

---

## More Information

- **Main Package:** [`atabey`](https://www.npmjs.com/package/atabey) (CLI + Framework)
- **GitHub:** [github.com/ysf-bkr/atabey](https://github.com/ysf-bkr/atabey)
- **Documentation:** [ARCHITECTURE.md](../ARCHITECTURE.md)
- **Contributing:** [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Enterprise:** ybekar@msn.com

---

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
