# [GOV] Agent Atabey — MCP-Powered AI Governance & Multi-Agent Workflow Layer for AI Coding Assistants

[![Version](https://img.shields.io/badge/Version-v0.0.15-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey)](https://www.npmjs.com/package/atabey)
[![npm-mcp](https://img.shields.io/npm/v/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![Type-Safety](https://img.shields.io/badge/Type--Safety-100%25-green.svg)](https://github.com/ysf-bkr/atabey)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Tests](https://img.shields.io/badge/Tests-266%20passed-brightgreen)](https://github.com/ysf-bkr/atabey)
[![MCP Tools](https://img.shields.io/badge/MCP%20Tools-35-blue)](https://github.com/ysf-bkr/atabey)
[![Engine Tests](https://img.shields.io/badge/Engine%20Tests-56%20passed-brightgreen)](https://github.com/ysf-bkr/atabey)

**Agent Atabey** is an **MCP (Model Context Protocol) server** designed specifically for agentic developer workflows. It plugs directly into your AI coding interface — such as Claude Code, Gemini CLI, or Cursor — to govern, secure, and coordinate the terminal/CLI commands and file modification loops executed autonomously by these AI assistants.

> **Philosophy:** "Order from Chaos"
> **Governance Context:** In an agentic workflow, the AI assistant runs the development tools, shell commands, and file edits. Atabey acts as the deterministic governance and safety layer over these AI execution loops.

---

## 🚀 How It Works

Atabey connects to your AI interface as an **MCP tool server**. Once connected, you use `@agent` commands directly in your AI chat:

```
You (@backend): "Create a user login service with JWT authentication"
     │
     ▼
  Atabey MCP Server (framework-mcp/)
     │  Intercepts @agent command
     │  Routes via RoutingEngine (TF-IDF)
     │  Routes to @backend specialist
     │  Quality Gate checks output
     │  Stores in Vector Memory
     │
     ▼
  Returns governed, reviewed, audited code
```

**No separate terminal needed. No CLI commands for daily use.** Just chat with your AI and use `@agent` syntax.

> [!NOTE]
> **Execution Context:** The LLM inference/execution is handled entirely inside the developer's active AI interface (such as Claude Code or Cursor). Atabey acts as the context injector and policy engine, silently evaluating prompts, routing instructions, and checking output code against quality guidelines.

---

## 📋 Table of Contents

- [Quick Start](#quick-start)
- [How Atabey Plugs Into Your AI](#how-atabey-plugs-into-your-ai)
- [Installation](#installation)
- [Profile-Based Setup](#profile-based-setup)
- [13 Specialized Agents](#13-specialized-agents)
- [Core Features](#core-features)
- [Dashboard](#dashboard)
- [CLI Reference](#cli-reference)
- [Architecture](#architecture)
- [Security](#security)
- [Contributing](#contributing)

---

## Quick Start

### 1. Initialize Atabey in Your Project

```bash
npx atabey init gemini --profile freelancer --yes
```

### 2. Connect to Your AI Interface

Atabey generates an `mcp.json` config. Point your AI assistant to it:

**Claude Code:**
```json
// mcp.json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "ATABEY_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

**Gemini CLI:**
```bash
# Stdio mode (local, single user)
gemini config set mcpServers.atabey.command "npx"
gemini config set mcpServers.atabey.args "[\"-y\", \"atabey-mcp\"]"
gemini config set mcpServers.atabey.env "{\"MCP_TRANSPORT\": \"stdio\", \"ATABEY_PROJECT_ROOT\": \"/path/to/your/project\"}"
```

**Cursor:**
```json
// .cursor/mcp.json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

### 3. Start Using in AI Chat

Open your AI interface and simply type:

```
@backend Create a REST API for user management with CRUD operations
@security Audit the authentication middleware
@quality Run compliance check on the new feature
```

**That's it.** Atabey handles routing, quality gates, memory, and governance automatically.

---

## How Atabey Plugs Into Your AI

```
┌──────────────────────────────────────────────────────────────────┐
│                   YOUR AI INTERFACE                                │
│   Claude Code · Gemini CLI · Cursor · Codex CLI                   │
│   You type: @backend Create login service                         │
├──────────────────────────────────────────────────────────────────┤
│                    MCP PROTOCOL (stdio)                            │
│   JSON-RPC messages over stdin/stdout                             │
├──────────────────────────────────────────────────────────────────┤
│                    ATABEY MCP SERVER                               │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  34 Tools: read_file, write_file, send_message,         │   │
│   │  orchestrate_loop, run_tests, check_lint                │   │
│   └──────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                    GOVERNANCE LAYER                                │
│   Quality Gate → Risk Engine → Vector Memory → Audit Log         │
└──────────────────────────────────────────────────────────────────┘
```

Atabey is **not a separate execution engine**. It is a context-aware governance and policy middleware that intercepts, validates, and routes the actions of AI coding assistants using their own CLIs:
- **13 Specialized Agent Contexts** (injected templates to structure AI reasoning)
- **Deterministic Quality Gates** (AST analysis + lint + tests validating AI writes before commit)
- **Risk Gate & Heuristic Scanning** (blocking dangerous shell commands or edits and requiring human passcode confirmation)
- **Persistent Vector Memory** (allowing AIs to query project context locally)
- **Audit trails** (every action logged)

---

## Installation

### Requirements

| Requirement | Version |
|------------|---------|
| **Node.js** | >= 18.0.0 |
| **npm** | >= 9.0.0 |
| **AI Interface** | Claude Code, Gemini CLI, Cursor, Codex CLI |

### Quick Install

```bash
# Install globally (recommended)
npm install -g atabey

# Initialize with your preferred profile
npx atabey init gemini --profile freelancer --yes

# Verify installation
npx atabey status

# (Optional) Open the web dashboard
npx atabey dashboard
```

---

## Profile-Based Setup

Choose the profile that matches your team size. You can also customize your setup using **`--focus`** and **`--lang`** options to match your project type and preferred language.

### `--profile freelancer` (1-3 people)

```bash
# Default setup (Fullstack)
npx atabey init gemini --profile freelancer

# Custom focus (Mobile) in English
npx atabey init gemini --profile freelancer --focus mobile --lang en --yes
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | `@manager`, `@quality` + focus-specific agents (`@backend` for backend, `@frontend` for frontend, `@mobile` for mobile) |
| **Setup Time** | ~10 seconds |
| **Daily Workflow** | Chat with AI using focus-specific specialist agents |
| **Governance** | Basic quality gate + risk engine |
| **Why?** | Minimal overhead, just code |

### `--profile team` (5-15 people)

```bash
# Default setup (Fullstack)
npx atabey init gemini --profile team --unified

# Custom focus (Backend-only)
npx atabey init gemini --profile team --focus backend --yes
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | 5-8 focus-specific agents (e.g. manager, architect, backend, quality, database, security for backend focus) |
| **Setup Time** | ~30 seconds |
| **Daily Workflow** | Multi-agent collaboration with quality gate |
| **Dashboard** | 12 live modules, WebSocket real-time (shows only configured agents) |
| **Governance** | Quality gate + risk engine + contract validation |
| **Why?** | Team-scale governance without overhead |

### `--profile enterprise` (15+ people)

```bash
npx atabey init gemini --profile enterprise
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | All 13 agents (Supreme + Core + Recon) |
| **Setup Time** | ~1 minute |
| **Daily Workflow** | Full governance with human-in-the-loop |
| **Dashboard** | 12 modules + audit/error/memory tracking |
| **Security** | Human-in-the-Loop, KVKK PII masking, audit log |

### Custom Setup

```bash
npx atabey init gemini
# Interactive menu: choose agents, directories, focus, languages, and colors manually
```

---

## 13 Specialized Agents

> [!NOTE]
> Each agent listed below represents a specialized prompt and rule-template context injected via the MCP server. The actual reasoning and file modification are performed by the developer's active client AI interface using the instructions supplied by these agents.

| Agent | Tier | Role | Freelancer | Team | Enterprise |
|-------|------|------|:----------:|:----:|:----------:|
| **@manager** | Supreme | Orchestration, governance, quality gate | ✅ | ✅ | ✅ |
| **@security** | Supreme | Security audit, vulnerability scanning | ❌ | ✅ | ✅ |
| **@architect** | Core | System design, contracts, architecture | ❌ | ✅ | ✅ |
| **@backend** | Core | Backend dev, API, business logic, tests | ✅ | ✅ | ✅ |
| **@frontend** | Core | UI, atomic components, responsive design | ❌ | ✅ | ✅ |
| **@quality** | Core | Compliance, lint, test coverage | ✅ | ✅ | ✅ |
| **@database** | Core | Database management, migrations, queries | ❌ | ✅ | ✅ |
| **@analyst** | Core | Strategy analysis, requirements | ❌ | ❌ | ✅ |
| **@mobile** | Core | React Native mobile development | ❌ | ❌ | ✅ |
| **@native** | Core | Native platform integration | ❌ | ❌ | ✅ |
| **@devops** | Core | CI/CD, deploy, infrastructure | ❌ | ❌ | ✅ |
| **@explorer** | Recon | Codebase discovery, analysis | ❌ | ❌ | ✅ |
| **@git** | Recon | Version control, commit management | ❌ | ❌ | ✅ |

---

## Core Features

### 1. Deterministic Quality Gate
No agent can push code directly to production. All outputs pass through AST analysis (compliance), linting, and unit tests. Failed code triggers an automatic 3-attempt retry loop.

### 2. Persistent Vector Memory
Project context, contracts, and past tasks are stored locally via `better-sqlite3` using TF-IDF semantic search (cosine similarity). Agents search past architectural decisions.

### 3. Hermes Message Broker
Agents communicate asynchronously via a SQLite-backed message queue. A file-based lock protocol prevents race conditions.

### 4. Risk Engine (Human-in-the-Loop — In-Chat Approval)
Operations containing `DROP`, `DELETE`, `TRUNCATE`, or secret manipulation are flagged. Execution is blocked until human approval.

> [!NOTE]
> **Heuristic Detection:** The Risk Engine relies on deterministic keyword and path-pattern heuristics (e.g., matching SQL command strings) rather than complex machine learning models to identify and block high-risk operations.

**In-Chat Approval (no terminal switch needed):**
When an operation is blocked, the AI is instructed to call the `approve_operation` MCP tool:
```
# AI calls this tool directly in chat:
approve_operation { "action": "approve", "traceId": "trace-xyz" }
approve_operation { "action": "reject",  "traceId": "trace-xyz" }
approve_operation { "action": "list" }   # See all pending approvals
```

**Alternative (terminal):** `atabey approve <traceId>`

### 5. Smart Routing Engine
TF-IDF keyword matching routes natural language tasks to the most capable agent. Uses specialized weights for all 13 agents.

### 6. Web Dashboard
Real-time WebSocket dashboard with 12 live modules. Fully responsive (mobile + desktop).

### 7. Multi-Platform Support
Claude Code, Gemini CLI, Cursor, Codex CLI, Antigravity CLI — automatic agent configuration for all platforms.

### 8. Polyglot Backend Support
Node.js, Go, Java, Python, .NET — automatic scaffolding based on backend language selection.

### 9. Multi-User Distributed Lock Registry
When multiple developers work on the same repository, their contextual agents might attempt to modify the same files simultaneously. Atabey implements a Git-aware distributed locking mechanism (`DistributedLock`). It dynamically identifies the lock owner using `git config user.name` and blocks other processes from mutating the locked resources until released or expired, preventing merge conflicts and race conditions.

### 10. Multi-Client MCP Support (Stdio + HTTP/SSE)
Atabey supports two transport modes:

**Stdio Mode (Default - Each developer runs their own instance):**
```bash
# Each developer on their own machine
atabey mcp start
```

**HTTP/SSE Mode (Single server serves the entire team):**
```bash
# Run on a shared server or one developer's machine
MCP_TRANSPORT=http MCP_PORT=5858 atabey mcp start
```
```json
// Each developer's mcp.json:
{
  "mcpServers": {
    "atabey": {
      "url": "http://192.168.1.100:5858/sse"
    }
  }
}
```
In SSE mode, multiple IDEs/clients can connect simultaneously. Each client gets a dedicated session. Configure via `MCP_PORT` (default: **5858**) and `MCP_HOST` environment variables.

### 11. AI Discipline Engine (Tool-Level Governance)
Atabey enforces strict AI behavior rules **at the MCP middleware layer** — AI cannot bypass these:

- **Rate Limiting**: Max 60 calls/minute per agent (configurable via `MCP_MAX_CALLS_PER_MINUTE`)
- **File Size Limits**: Prevents reading/writing files >1MB (configurable via `MCP_MAX_FILE_SIZE`)
- **Tool Blacklist/Whitelist**: Per-agent tool access control (`MCP_RESTRICTED_TOOLS`, `MCP_AGENT_TOOL_WHITELIST`)
- **Loop Detection**: Blocks consecutive same-tool calls (>10 in a row triggers cooldown)
- **Response Validation**: Checks response size and binary content before returning to AI
- **Cooldown Mechanism**: Automatic cooldown when limits are exceeded

> **Note:** `run_shell_command` is **not restricted by default** — it uses a command allowlist (`npm test`, `git`, `go test`, etc.) with shell metacharacter injection protection. Restrict specific commands via `MCP_RESTRICTED_TOOLS` if needed.

```bash
# Restrict specific tools (optional, empty by default)
export MCP_RESTRICTED_TOOLS="some_dangerous_tool"
export MCP_AGENT_TOOL_WHITELIST="@backend:read_file,write_file,replace_text"
```

### 12. Token Economy & Cost Tracking
Every MCP tool call is tracked for token usage and estimated cost:

- **Per-Agent Metrics**: Total calls, tokens consumed, estimated cost per agent
- **Per-Action Metrics**: Most expensive operations tracked
- **Dashboard Integration**: Real-time cost visualization in the Metrics panel
- **Cost Calculation**: Estimated at $0.003 per 1K tokens

```bash
# View metrics via API
curl http://localhost:5858/api/metrics
```

### 13. MCP Authentication (HTTP/SSE Mode)
When running in HTTP/SSE mode, API and MCP routes are protected with Bearer token authentication:

```bash
# Set auth token
export MCP_AUTH_TOKEN="your-secret-token"

# Client connects with token
curl -H "Authorization: Bearer your-secret-token" http://localhost:5858/api/status
```

- Public endpoints: `/api/health`, `/mcp/health`, static UI
- Protected endpoints: all `/api/*` and `/mcp/*` routes
- Unauthorized requests return 401 with configuration instructions

### 14. Data Classification & Portability
Atabey automatically classifies data into security levels:

| Level | Description | Example |
|-------|-------------|---------|
| **public** | No sensitive data | General code |
| **internal** | Project-internal data | Configuration |
| **confidential** | PII detected | Emails, phones |
| **restricted** | Highly sensitive | API keys, tokens, IBAN |
| **critical** | Security-critical | Credentials, secrets |

Data portability (KVKK Art. 11 / GDPR Art. 20):
```bash
# View agent statuses, token usage, and cost distributions
atabey status

# Run full health and compliance checks
atabey check
```

### 15. Adapter-Skill System
Each AI platform (Claude, Gemini, Cursor, Codex) has a unique skill mapping:

- **Platform-Specific Tool Mapping**: Internal tool names → platform-native identifiers
- **Skill-Based Agent Configuration**: Each agent gets platform-optimized tool sets
- **Unified Hub**: `.agents/` directory supports multi-adapter configurations

### 16. Explorer & Security Audit Commands
Built-in codebase analysis tools:

```bash
# Generate dependency graph
atabey explorer graph src/

# Run security audit
atabey security src/

# Audit code quality
atabey explorer audit src/
```

### 17. Memory Layers
Atabey uses a multi-layered memory architecture:

| Layer | Description | Storage |
|-------|-------------|---------|
| **Core Memory** | Project state, trace, status | SQLite + JSON |
| **Vector Memory** | TF-IDF document embeddings | SQLite |
| **Knowledge Base** | Structured project knowledge | SQLite |
| **Task Store** | Planned tasks with DAG dependencies | SQLite |
| **Audit Logs** | All operation records | SQLite |
| **Specialty Memory** | Per-agent learned conventions | Markdown files |

### 18. GDPR & KVKK - Automated PII Masking
Atabey implements **multi-layer PII masking** for compliance with KVKK (Turkish Law No. 6698) and GDPR (European Union):

**Layer 1 - MCP Middleware (Automatic):**
All MCP tool calls are intercepted:
- **Args Masking**: Tool arguments from the AI are masked before reaching the handler
- **Result Masking**: Handler results are masked before returning to the AI
- **No sensitive data ever reaches the AI model**

**Layer 2 - Logger PII Masking:**
All log entries are scanned for PII before being written. Sensitive data is automatically redacted.

**Layer 3 - Manual `mask_pii` Tool:**
Users can manually mask text or objects on demand:
```
mask_pii(text: "Email: user@example.com") → "Email: ***@***"
```

**Supported Patterns:**
| Pattern | Example | Masked |
|---------|---------|--------|
| Email | `user@example.com` | `***@***` |
| Phone | `+90 555 123 45 67` | `***-***-****` |
| TC ID (Turkish ID) | `12345678901` | `***********` |
| API Key | `sk-abc...xyz` | `***-REDACTED-***` |
| JWT Token | `eyJ...eyJ...` | `***-JWT-REDACTED-***` |
| IP Address | `192.168.1.1` | `***.***.***.***` |
| Credit Card | `4111 1111 1111 1111` | `****-****-****-****` |
| IBAN | `TR33...1326` | `****-IBAN-REDACTED-****` |
| Date of Birth | `15/08/1990` | `**/**/****` |
| SSN | `123-45-6789` | `***-**-****` |

**Dashboard GDPR/KVKK Panel:**
- PII masked/detected statistics
- Data category distribution (USER_DATA, SECURITY, COMPLIANCE, RESTRICTED)
- Audit trail with masked data details
- GDPR Art. 17 / KVKK Art. 7 - Right to Erasure (Unutulma Hakkı) execution
- Category filter for event viewing

---

## Dashboard

```bash
npx atabey dashboard  # Opens at http://localhost:5858
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
| 📊 **Dashboard** | System overview | Mixed |

---

## CLI Reference

```bash
atabey init [adapter]        Initialize Atabey (--profile freelancer|team|enterprise)
atabey mcp start             Start MCP server (connects to your AI interface)
atabey mcp install           Generate mcp.json config for AI integration
atabey dashboard [port]      Open web dashboard (default: 5858)
atabey status                Show agent statuses and costs
atabey check                 Full health and compliance check
atabey orchestrate           Start orchestration workflow loop
atabey approve <traceId>     Approve a blocked high-risk task (terminal alternative)
atabey hitl answer "<text>"  Answer a pending ask_human question
atabey @agent "task"         Send task directly to an agent
```

### `atabey init [adapter]` Options

| Option | Values | Description |
|---|---|---|
| `[adapter]` | `gemini`, `claude`, `cursor`, `grok`, `codex`, `local`, `antigravity-cli` | The target AI platform/client for initialization. |
| `--profile` | `freelancer`, `team`, `enterprise` | Preset agent group layout and governance complexity. |
| `--focus` | `fullstack`, `backend`, `frontend`, `mobile`, `mobile-fullstack` | Optimize active agents and templates for the project type. |
| `--lang` | `tr`, `en` | Set the language for constitution (`ATABEY.md`) and standard operating procedures. |
| `--unified` | *None (Flag)* | Place all agent instruction files under a single `.agents/` directory with native client links. |
| `--yes` | *None (Flag)* | Run in non-interactive mode using default or provided parameters. |
| `--dryRun` | *None (Flag)* | Simulate the initialization run without writing any files or folders to the workspace. |

> **In-chat alternative:** Use `approve_operation` MCP tool directly in your AI CLI chat — no terminal switch needed.

Full command list: see `atabey help` or [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      AI Chat Interface                            │
│    @backend Create login service (in Claude/Gemini/Cursor)      │
├──────────────────────────────────────────────────────────────────┤
│                    MCP Server (framework-mcp/)                    │
│                    34 Tools · Stdio Transport                     │
│                    Zod Validation · Error Handling                │
├──────────────────────────────────────────────────────────────────┤
│                    src/cli/  30+ Commands                         │
│                    src/modules/  Engines + Agents                 │
│                    src/shared/  Types + Storage                   │
├────────────────┬───────────────────────────┬──────────────────────┤
│                ▼                           ▼                      │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Web Dashboard            │  │ SQLite (better-sqlite3)      │  │
│  │ Port 5858                │  │ Hermes Queue · Memory        │  │
│  │ 8 Module WS Live         │  │ Audit Logs · Locks          │  │
│  │ Responsive (Mob+Desk)    │  │                              │  │
│  └──────────────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## ✅ Implemented Governance Features

> These features were previously listed as "Blind Spots" but are now fully implemented:

| # | Feature | Status | Implementation |
|---|---------|--------|---------------|
| 1 | Token Budget / Circuit Breaker | ✅ **Implemented** | `context-optimizer.ts` — budget tracking, per-agent limits, 50/80/90/100% alert thresholds |
| 2 | Silent Semantic Routing | ✅ **Implemented** | `silent-router.ts` — TF-IDF detection, stealth context injection via tool response |
| 3 | In-Chat Human-in-the-Loop | ✅ **Implemented** | `approve_operation` MCP tool — approve/reject/list without leaving AI CLI chat |
| 4 | Prompt Conflict Resolution (Auto-Rollback) | ✅ **Implemented** | `auto-rollback.ts` — AST scan, secret detection, file snapshot + restore + instruction |
| 5 | Distributed CLI Telemetry | 🟡 **Partial** | `telemetry-streamer.ts` — local JSONL + HTTPS batch ready; central server not yet deployed |

---

## 🔍 Detailed Feature Analysis

### Auto-Rollback & Rollback Mechanism
`framework-mcp/src/utils/auto-rollback.ts`

**How It Works:**
```
[AI write_file/replace_text/patch_file call]
   │
   ├── 1. Pre-Write Snapshot → Original file content saved (SnapshotManager)
   ├── 2. Tool executes → File is written
   ├── 3. Post-Write Validation → rules-engine.ts GOV scan
   │      ├── ✅ Clean → Allow, clear snapshot
   │      └── ❌ Violation (any type, console.log, secret, copyleft) →
   │             ├── Original file restored
   │             ├── New file deleted
   │             └── REGENERATE instruction sent to AI:
   │                 "⛔ AI Output Blocked – Governance Violation
   │                  🔴 No `any` Type (file.ts:5)
   │                  Fix: Replace `any` with `unknown`"
   └── Dashboard WS → rollback_violation event
```

**Detected Violations:**
| Violation | Severity | Detection |
|-----------|----------|-----------|
| `any` type usage | 🔴 CRITICAL | Regex: `: any\b` |
| `console.log`/`.error`/`.warn`/`.debug` | 🔴 CRITICAL | Regex (exempts logger.ts) |
| Hardcoded API Key (sk-, ghp_, AIza) | 🟠 HIGH | Regex pattern |
| Hardcoded GitHub Token | 🟠 HIGH | `ghp_` pattern |
| Copyleft license violation | 🔴 CRITICAL | `license-scanner.ts` |

**Test Status:** ✅ `auto-rollback.test.ts` — 14 tests, 228 lines, all scenarios covered.

**Critical Assessment:** Working. The `buildRegenerateInstruction()` method tells the AI exactly what it did wrong and how to fix it. This is far more valuable than simple blocking.

---

### Specialty Memory (Agent Learning Mechanism)
`src/modules/engines/evaluation-engine.ts`

| Status | Detail |
|--------|--------|
| ✅ **Error Learning** | Compliance/lint/test failure → `updateSpecialtyMemory()` writes to `.atabey/memory/specialties/<agent>.md` |
| ❌ **Success Learning** | No mechanism to extract lessons from successful tasks |
| ❌ **Auto-Injection** | `readLearnedConventions()` exists but is not automatically injected into AI context |
| ⚠️ **Learning Opportunity** | Agent never asked "What did I learn from this task?" on completion |

**Current Flow:**
```
Task → Evaluation → Any errors?
   ├── Yes → `updateSpecialtyMemory(agent, "Compliance Violations Detected...")`
   └── No → Nothing saved (❌)
```

**Desired Flow:**
```
Task → Evaluation →
   ├── Error → Save error lesson
   └── Success → Save success lesson: "agent/service pattern was used successfully"
```

---

### Token/Cost Tracking (FinOps)
`framework-mcp/src/utils/finops.ts`

| Feature | Status |
|---------|--------|
| ✅ Per-agent token tracking | Every MCP tool call logged via `Metrics.logUsage()` |
| ✅ Monthly budget | `ATABEY_BUDGET_MONTHLY` env for USD-based limit |
| ✅ Per-agent budget | `ATABEY_BUDGET_AGENT_MAX` for agent-based limit |
| ✅ Auto-shutdown | MCP middleware returns error when budget exceeded |
| ✅ Alert thresholds | 50/80/90/100% warning levels |
| ✅ Dashboard panel | FinOpsPanel.tsx with live visualization |
| ✅ API endpoint | `GET /api/metrics` — agent/action level detail |
| ❌ **Weekly Summary** | `atabey status` output does not provide a weekly rollup overview |

**Usage:** `framework-mcp/src/index.ts` (lines 150-153) calls `Metrics.logUsage()` on every tool call.

---

### KVKK/GDPR Data Privacy
`src/shared/pii.ts`

| Pattern | Mask | Test |
|---------|------|------|
| Email | `***@***` | ✅ |
| Phone (+90 TR, international) | `***-***-****` | ✅ |
| TC ID (11 digits) | `***********` | ✅ |
| API Key (OpenAI, GitHub, Google) | `***-REDACTED-***` | ✅ |
| JWT Token | `***-JWT-REDACTED-***` | ✅ |
| IP (IPv4, IPv6) | `***.***.***.***` | ✅ |
| Credit Card (AMEX included) | `****-****-****-****` | ✅ |
| IBAN | `****-IBAN-REDACTED-****` | ✅ |
| Date of Birth | `**/**/****` | ✅ |
| SSN (US) | `***-**-****` | ✅ |
| Password/Secret fields | `***-REDACTED-***` | ✅ |

**Layered Protection:**
1. **MCP Middleware** — `maskToolArgs()`: AI arguments masked before reaching handler
2. **MCP Middleware** — `maskToolResult()`: Handler result masked before returning to AI
3. **Logger** — All log entries scanned for PII
4. **Dashboard API** — All API responses masked

**Dashboard:** PrivacyPanel.tsx — PII masked/detected statistics, category distribution, Right to Erasure.

---

### 🐞 Detected Issues

| # | Issue | File | Fix |
|---|-------|------|-----|
| 1 | `MCP_TRANSPORT=stdio` env missing | `src/cli/commands/mcp.ts:66` | Added `MCP_TRANSPORT: "stdio"` |
| 2 | No success task learning | `src/modules/engines/evaluation-engine.ts` | `updateSpecialtyMemory()` should be called on success too |
| 3 | Specialty memory not auto-injected into AI | `silent-router.ts` / `discipline.ts` | `.atabey/memory/specialties/*.md` content should be injected on agent calls |
| 4 | No weekly cost summary | `finops.ts` | Add weekly rollup statistics to `atabey status` command |

---

## Strategic Roadmap

| # | Feature | Priority | Status |
|---|---------|----------|--------|
| 1 | Agent specialty memory → auto-sync to agent files | 🟠 High | 🟡 **Partial** (error learning only) |
| 2 | MCP `prompts/` endpoint for session-level governance injection | 🟠 High | Planned |
| 3 | Central Enterprise Server (telemetry ingest + org dashboard) | 🟡 Medium | Planned |
| 4 | Dynamic rule loading from `.atabey/rules/*.json` | 🟡 Medium | Planned |

---

## Security

### Enterprise-Grade Governance
Atabey defines "enterprise-grade" through deterministic rules: AST compliance parsing, strict TypeScript type validation (zero `any`), syntax/linter checks, and automated unit tests, rather than unpredictable probabilistic algorithms.

### Zero Type Hole Policy
- `any` type usage is **strictly forbidden**
- All function inputs validated with Zod schemas
- Type safety enforced in CI pipeline

### Prudent Mocking Policy
- Core governance logic, schemas, and rule engines are verified against real implementations without mock data.
- Unit and integration boundaries (such as remote Hermes polling loops, network calls, and LLM provider interfaces) utilize lightweight, standard mocks to ensure isolation and fast test execution.

### PII Masking (KVKK Compliant)
- All logs scanned for Personally Identifiable Information
- Sensitive data automatically masked
- Turkish KVKK and EU GDPR compliant

### Human-in-the-Loop
- Risk score ≥ 60 requires human approval
- `DROP`, `DELETE`, `TRUNCATE` operations blocked
- **In-chat approval:** `approve_operation` MCP tool (no terminal switch)
- **Terminal fallback:** `atabey approve <traceId>`

---

## Testing

```bash
npm test                    # Run all tests (266 passing)
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
```

---

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on the code of conduct and pull request process.

```bash
git clone https://github.com/ysf-bkr/atabey.git
cd atabey
npm install
npm install --prefix framework-mcp
npm install --prefix framework-mcp/dashboard
npm run build
```

---

## License & Business Model

**Code:** GNU Affero General Public License v3.0 — [Yusuf BEKAR](mailto:ybekar@msn.com)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

**Network Use Clause (Section 13):** If you modify the Program and make it accessible over a network (e.g., as a SaaS service), you must provide the complete corresponding source code to all users who interact with it remotely. This prevents others from selling Atabey as a closed-source SaaS.

**Service Model (Support / SLA / Consulting):** The code is **100% free and open source**. Revenue comes from:
- **Enterprise Support & SLA** — Guaranteed response times, priority bug fixes, custom integrations
- **Consulting & Training** — Team onboarding, governance policy design, architecture review
- **Managed Enterprise Server** — Centralized telemetry, multi-team budget management, org-wide dashboard

Enterprise inquiries: **ybekar@msn.com**

---

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
