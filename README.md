# [GOV] Agent Atabey — MCP-Powered AI Governance & Multi-Agent Workflow Layer for AI Coding Assistants

[![Version](https://img.shields.io/badge/Version-v0.0.19-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey)](https://www.npmjs.com/package/atabey)
[![npm-mcp](https://img.shields.io/npm/v/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![Type-Safety](https://img.shields.io/badge/Type--Safety-100%25-green.svg)](https://github.com/ysf-bkr/atabey)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP Tools](https://img.shields.io/badge/MCP%20Tools-32-blue)](https://github.com/ysf-bkr/atabey)
[![Agents](https://img.shields.io/badge/Specialized%20Agents-14-purple)](https://github.com/ysf-bkr/atabey)
[![Platforms](https://img.shields.io/badge/Supported%20Platforms-7-orange)](https://github.com/ysf-bkr/atabey)
[![Skills](https://img.shields.io/badge/Core%20Skills-7-yellow)](https://github.com/ysf-bkr/atabey)
[![Governance Score](https://img.shields.io/badge/AI%20Governance-92%2F100-success)](https://github.com/ysf-bkr/atabey)
[![Orchestration Score](https://img.shields.io/badge/Orchestration-90%2F100-success)](https://github.com/ysf-bkr/atabey)

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
  Atabey MCP Server (atabey-mcp/)
     │  Intercepts @agent command
     │  Routes via RoutingEngine (TF-IDF + Semantic)
     │  Routes to @backend specialist
     │  13-Layer Governance Pipeline validates
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
- [5 Core Capabilities Overview](#5-core-capabilities-overview)
- [How Atabey Plugs Into Your AI](#how-atabey-plugs-into-your-ai)
- [Supported Platforms](#supported-platforms)
- [Installation](#installation)
- [Profile-Based Setup](#profile-based-setup)
- [14 Specialized Agents](#14-specialized-agents)
- [32 MCP Tools](#32-mcp-tools)
- [7 Core Skills](#7-core-skills)
- [3-Layer Memory System](#3-layer-memory-system)
- [Knowledge Base (30+ Standards)](#knowledge-base-30-standards)
- [13-Layer Governance Pipeline](#13-layer-governance-pipeline)
- [Core Features](#core-features)
- [Dashboard](#dashboard)
- [CLI Reference](#cli-reference)
- [Architecture](#architecture)
- [Security](#security)
- [KVKK/GDPR Compliance](#kvkkgdpr-compliance)
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
gemini config set mcpServers.atabey.command "npx"
gemini config set mcpServers.atabey.args "[\"-y\", \"atabey-mcp\"]"
gemini config set mcpServers.atabey.env "{\"MCP_TRANSPORT\": \"stdio\", \"ATABEY_PROJECT_ROOT\": \"/path/to/your/project\"}"
```

**Cursor:**
```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": { "MCP_TRANSPORT": "stdio" }
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

**That's it.** Atabey handles routing, quality gates, memory, governance, and audit automatically.

---

## 5 Core Capabilities Overview

Atabey AL is built on **5 core capabilities** that work together seamlessly:

| # | Capability | Description | Score |
|---|-----------|-------------|-------|
| 🛠️ | **32 MCP Tools** | File system, search, messaging, governance, memory, quality, network, orchestration | 95/100 |
| 🧠 | **3-Layer Memory** | Vector Memory (TF-IDF/OpenAI), Project Memory, Specialty Memory (agent learning) | 93/100 |
| 🤖 | **14 Specialized Agents** | 3-tier hierarchy (Supreme/Core/Recon) with state machine | 94/100 |
| 🎯 | **7 Core Skills** | Platform-adaptive skills for 7 different AI platforms | 90/100 |
| 📚 | **30+ Knowledge Standards** | Governance, security, architecture, compliance, deployment standards | 92/100 |
| **🎯** | **Overall** | **AI Governance & Multi-Agent Orchestration** | **93/100** |

---

## How Atabey Plugs Into Your AI

```
┌──────────────────────────────────────────────────────────────────┐
│                   YOUR AI INTERFACE                                │
│   Claude Code · Gemini CLI · Cursor · Codex CLI · Local LLM      │
│   You type: @backend Create login service                         │
├──────────────────────────────────────────────────────────────────┤
│                    MCP PROTOCOL (stdio/SSE)                        │
│   JSON-RPC messages over stdin/stdout or HTTP/SSE                 │
├──────────────────────────────────────────────────────────────────┤
│                    ATABEY MCP SERVER                               │
│   ┌──────────────────────────────────────────────────────────┐   │
│   │  32 Tools · 13-Layer Governance Pipeline ·               │   │
│  │  Risk Engine · Loop Detection · FinOps · Auto-Rollback  │   │
│   └──────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                    GOVERNANCE LAYER                                │
│   Quality Gate → Risk Engine → Vector Memory → Audit Log         │
│   PII Masking → Discipline → License Scan → Injection Protection │
└──────────────────────────────────────────────────────────────────┘
```

Atabey is **not a separate execution engine**. It is a context-aware governance and policy middleware that intercepts, validates, and routes the actions of AI coding assistants:
- **14 Specialized Agent Contexts** (injected templates to structure AI reasoning)
- **Deterministic Quality Gates** (AST analysis + lint + governance validation)
- **Risk Gate & Heuristic Scanning** (blocking dangerous commands, requiring human approval)
- **Persistent Vector Memory** (TF-IDF + OpenAI embeddings, cosine similarity search)
- **Audit trails** (every action logged, KVKK/GDPR compliant)

---

## Supported Platforms

Atabey AL supports **7 platforms** with automatic adapter configuration:

| Platform | MCP Mode | Agents Export | Tools | Skills | Shim |
|----------|----------|---------------|-------|--------|------|
| **Claude Code** ⭐ | `.mcp.json` + `claude_desktop_config.json` | `.claude/agents/*.md` | 20 tools | 7 skills | `CLAUDE.md` |
| **Gemini CLI** | `.gemini/mcp.json` | `.gemini/agents/*.md` | 14 tools | 6 skills | `GEMINI.md` |
| **Cursor IDE** | `.cursor/mcp.json` | `.cursor/rules/*.mdc` | 9 tools | 4 skills | `CURSOR.mdc` |
| **Codex CLI (Copilot)** | `.vscode/mcp.json` + `.mcp.json` | `.agents/instructions/*.md` | 9 tools | 4 skills | `copilot-instructions.md` |
| **Antigravity CLI** | `.agents/mcp_config.json` | `.agents/agents/*.md` + `agent.json` | 14 tools | 6 skills | `AGENTS.md` |
| **Grok** | `.grok/mcp_config.json` | `.grok/agents/*.md` | 9 tools | 4 skills | `GROK.md` |
| **Local LLM (Ollama)** | `.atabey/mcp_config.json` | `.atabey/agents/*.md` | 14 tools | 6 skills | `LOCAL_AI.md` |

> **Unified Mode:** `atabey init claude --unified` exports agents to **ALL platforms simultaneously**.

---

## Installation

### Requirements

| Requirement | Version |
|------------|---------|
| **Node.js** | >= 18.0.0 |
| **npm** | >= 9.0.0 |
| **AI Interface** | Claude Code, Gemini CLI, Cursor, Codex CLI, Grok, Antigravity, Local LLM |

### Quick Install

```bash
# Install globally (recommended)
npm install -g atabey

# Initialize with your preferred platform and profile
npx atabey init gemini --profile freelancer --yes

# Verify installation
npx atabey status

# (Optional) Open the web dashboard
npx atabey dashboard
```

---

## Profile-Based Setup

Choose the profile that matches your team size. You can also customize your setup using **`--focus`** and **`--lang`** options.

### `--profile freelancer` (1-3 people)

```bash
npx atabey init gemini --profile freelancer
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | `@manager`, `@quality` + focus-specific agents |
| **Setup Time** | ~10 seconds |
| **Daily Workflow** | Chat with AI using specialist agents |
| **Governance** | Quality gate + risk engine |
| **Best For** | Solo developers, minimal overhead |

### `--profile team` (5-15 people)

```bash
npx atabey init gemini --profile team --unified
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | 5-8 focus-specific agents (manager, architect, backend, quality, database, security) |
| **Setup Time** | ~30 seconds |
| **Dashboard** | 12 live modules, WebSocket real-time |
| **Governance** | Quality gate + risk engine + contract validation |
| **Best For** | Small-medium teams with governance needs |

### `--profile enterprise` (15+ people)

```bash
npx atabey init gemini --profile enterprise
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | All 14 agents (Supreme + Core + Recon) |
| **Setup Time** | ~1 minute |
| **Security** | Human-in-the-Loop, KVKK PII masking, audit log |
| **Governance** | Full governance with circuit breakers |
| **Best For** | Enterprise with compliance requirements |

---

## 14 Specialized Agents

| Agent | Tier | Capability | Role | Freelancer | Team | Enterprise |
|-------|------|:----------:|------|:----------:|:----:|:----------:|
| **@manager** | Supreme | 10/10 | Orchestration, governance, quality gate | ✅ | ✅ | ✅ |
| **@security** | Supreme | 10/10 | Security audit, vulnerability scanning | ❌ | ✅ | ✅ |
| **@architect** | Core | 9/10 | System design, contracts, architecture | ❌ | ✅ | ✅ |
| **@backend** | Core | 9/10 | Backend dev, API, business logic, tests | ✅ | ✅ | ✅ |
| **@frontend** | Core | 9/10 | UI, atomic components, responsive design | ❌ | ✅ | ✅ |
| **@quality** | Core | 9/10 | Compliance, lint, test coverage | ✅ | ✅ | ✅ |
| **@database** | Core | 9/10 | Database management, migrations, queries | ❌ | ✅ | ✅ |
| **@analyst** | Recon | 8/10 | Strategy analysis, requirements | ❌ | ❌ | ✅ |
| **@mobile** | Core | 8/10 | React Native mobile development | ❌ | ❌ | ✅ |
| **@native** | Recon | 8/10 | Native platform integration | ❌ | ❌ | ✅ |
| **@devops** | Core | 8/10 | CI/CD, deploy, infrastructure | ❌ | ❌ | ✅ |
| **@explorer** | Recon | 8/10 | Codebase discovery, analysis | ❌ | ❌ | ✅ |
| **@git** | Recon | 8/10 | Version control, commit management | ❌ | ❌ | ✅ |
| **@human** | — | — | Human approval placeholder | ✅ | ✅ | ✅ |

### Agent Hierarchy
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

---

## 32 MCP Tools

### File System (6)
`read_file`, `view_file`, `write_file`, `replace_text`, `batch_surgical_edit`, `patch_file`

### Search & Exploration (4)
`list_dir`, `grep_search`, `get_project_map`, `get_project_gaps`

### Framework & System (10)
`run_shell_command`, `run_tests`, `get_system_health`, `check_active_ports`,
`get_framework_status`, `read_project_memory`, `get_memory_insights`,
`update_project_memory`, `orchestrate_loop`, `submit_plan`

### Control Plane (3)
`acquire_lock`, `release_lock`, `register_agent`

### Memory & Knowledge (4)
`store_knowledge`, `search_knowledge`, `delete_knowledge`, `update_contract_hash`

### Messaging & Human (3)
`send_agent_message`, `log_agent_action`, `ask_human`

### Compliance & Quality (4)
`mask_pii`, `analyze_code_quality`, `check_architecture_compliance`, `check_lint`

### Operations (3)
`approve_operation`, `compress_files`, `decompress_files`, `http_proxy_request`, `audit_dependencies`

---

## 7 Core Skills

| Skill | Tools | Description |
|-------|-------|-------------|
| **FILE_SYSTEM** | read_file, write_file | Token-efficient file operations |
| **EDITING** | replace_text, patch_file | Surgical code modification |
| **ORCHESTRATION** | orchestrate_loop, send_agent_message, get_framework_status, log_agent_action | Hermes messaging |
| **GOVERNANCE** | acquire_lock, release_lock, register_agent, update_contract_hash | Resource locking & contracts |
| **QUALITY_ASSURANCE** | run_shell_command, view_file | Testing & code quality |
| **DATABASE_MANAGEMENT** | view_file, replace_text, run_shell_command | DB & migrations |
| **DEVOPS_INFRASTRUCTURE** | run_shell_command, view_file | CI/CD & deployment |

Each skill adapts to the target platform (Claude → native tool names, Gemini → YAML, Codex → categories).

---

## 3-Layer Memory System

| Layer | Storage | Technology | Purpose |
|-------|---------|------------|---------|
| **Vector Memory** | SQLite | TF-IDF / OpenAI embeddings + Cosine similarity | Semantic search across project knowledge |
| **Project Memory** | Markdown | `PROJECT_MEMORY.md` | Central project state, synchronized every session |
| **Specialty Memory** | Markdown | `.atabey/memory/specialties/{agent}.md` | Per-agent learned conventions from past tasks |

**Memory Flow:**
```
Task → Evaluation Engine → Score (0-100)
  ├── Success → extractSuccessLesson() → updateSpecialtyMemory()
  └── Failure → compliance/lint/test lesson → updateSpecialtyMemory()
       ↓
  Next session: readLearnedConventions() → injected into agent prompt
```

---

## Knowledge Base (30+ Standards)

| Category | Standards |
|----------|-----------|
| **Governance** | governance-standards, llm-governance, crud-governance |
| **Architecture** | architecture-standards, auth-standards |
| **Development** | frontend-standards, nextjs-standards, mobile-standards, kysely-standards |
| **Security** | security-standards, security-audit-standards, logging-and-secrets |
| **DevOps** | deployment-standards, github-actions-standards |
| **Quality** | quality-standards, testing-standards, vitest-standards, playwright-standards |
| **Performance** | performance-standards, observability-standards |
| **UI/UX** | tailwind-standards, react-query-standards, react-router-standards |
| **Data** | typeorm-standards, vite-standards |
| **Economics** | token-economy, pino-standards, swagger-standards |

Agent knowledge files are automatically embedded into system prompts at build time.

---

## 13-Layer Governance Pipeline

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

---

## Core Features

### Deterministic Quality Gate
No agent can push code directly to production. All outputs pass through AST analysis (compliance) + linting + governance validation.

### Smart Routing Engine
TF-IDF + Semantic (cosine similarity) routing with 60/40 blend. Falls back to keyword-based routing when embeddings are unavailable.

### Hermes Message Broker
SQLite-backed async message queue for inter-agent communication. Lock-based protocol prevents race conditions.

### Risk Engine (Human-in-the-Loop)
Operations containing `DROP`, `DELETE`, `TRUNCATE`, or secret manipulation are flagged. Score ≥ 60 requires human approval.

### Specialty Memory (Agent Learning)
Agents learn from both successes and failures. Lessons stored in `.atabey/memory/specialties/` and auto-injected next session.

### Auto-Rollback
Pre-write snapshots, post-write governance scan, automatic rollback + regenerate instructions for the AI.

### Token Economy & Cost Tracking
Per-agent token/cost tracking, monthly budgets, 50/80/90/100% alert thresholds, auto-shutdown.

### Prompt Injection Protection
OWASP LLM01 compliant sanitization detected via role-playing, system prompt override, delimiters, and context manipulation patterns.

### Multi-Client MCP (Stdio + HTTP/SSE)
Two transport modes: Stdio (per-developer) and HTTP/SSE (shared server for entire team, port 5858).

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
atabey approve <traceId>     Approve a blocked high-risk task
atabey hitl answer "<text>"  Answer a pending ask_human question
atabey @agent "task"         Send task directly to an agent
atabey trace:new             Create a new trace
atabey verify-contract       Verify contract integrity
atabey plan [task]           Create a task plan
atabey memory                View project memory
atabey log [agent]           View agent logs
atabey explore [path]        Explore codebase
atabey security [path]       Run security audit
```

### `atabey init [adapter]` Options

| Option | Values | Description |
|--------|--------|-------------|
| `[adapter]` | `gemini`, `claude`, `cursor`, `grok`, `codex`, `local`, `antigravity-cli` | Target AI platform |
| `--profile` | `freelancer`, `team`, `enterprise` | Preset agent group layout |
| `--focus` | `fullstack`, `backend`, `frontend`, `mobile`, `mobile-fullstack` | Project type optimization |
| `--lang` | `tr`, `en` | Constitution language |
| `--unified` | Flag | Multi-platform export |
| `--yes` | Flag | Non-interactive mode |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      AI Chat Interface                            │
│    @backend Create login service (in Claude/Gemini/Cursor)      │
├──────────────────────────────────────────────────────────────────┤
│                    MCP Server (atabey-mcp/)                       │
│                    32 Tools · 13-Layer Governance                │
│                    Zod Validation · PII Masking                  │
├──────────────────────────────────────────────────────────────────┤
│                    src/cli/  30+ Commands                         │
│                    src/modules/  Engines + Agents + Memory       │
│                    src/shared/  Types + Storage + Audit          │
├────────────────┬───────────────────────────┬──────────────────────┤
│                ▼                           ▼                      │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐  │
│  │ Web Dashboard            │  │ SQLite (better-sqlite3)      │  │
│  │ Port 5858                │  │ Vector Memory · Hermes Queue │  │
│  │ 12 Module WS Live        │  │ Audit Logs · Locks · Tasks  │  │
│  │ Responsive (Mob+Desk)    │  │ Knowledge · Agent Registry  │  │
│  └──────────────────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Security

### Enterprise-Grade Governance
Deterministic rules: AST compliance parsing, strict TypeScript type validation (zero `any`), automated governance checks.

### Zero Type Hole Policy
- `any` type usage is **strictly forbidden**
- All function inputs validated with Zod schemas
- Type safety enforced in governance pipeline

### PII Masking (KVKK/GDPR Compliant)
- All logs scanned for Personally Identifiable Information
- Sensitive data automatically masked (20+ patterns)
- Turkish KVKK (Law No. 6698) and EU GDPR compliant
- **Right to Erasure** (KVKK Art. 7 / GDPR Art. 17) supported

### Human-in-the-Loop
- Risk score ≥ 60 requires human approval
- In-chat approval: `approve_operation` MCP tool
- Terminal fallback: `atabey approve <traceId>`

### AI Discipline Engine
- Rate Limiting: Max 60 calls/minute per agent
- File Size Limits: Prevents >1MB files
- Loop Detection: Blocks >10 consecutive same-tool calls
- Cooldown Mechanism: Automatic when limits exceeded
- Injection Protection: OWASP LLM01 compliant

---

## KVKK/GDPR Compliance

| Feature | KVKK | GDPR | Status |
|---------|------|------|--------|
| PII Masking (20+ patterns) | Art. 4, 5, 11, 12 | Art. 5, 32 | ✅ |
| Data Retention (30/90 days) | Art. 5, 7 | Art. 5, 17 | ✅ |
| Right to Erasure | Art. 7 | Art. 17 | ✅ |
| Audit Trail | Art. 11 | Art. 30 | ✅ |
| Data Classification | Art. 6 | Art. 9 | ✅ |
| Consent Management | Art. 5 | Art. 7 | ✅ |

---

## Testing

```bash
npm test                    # Run all tests
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
npm run build
```

---

## License & Business Model

**Code:** GNU Affero General Public License v3.0 — [Yusuf BEKAR](mailto:ybekar@msn.com)

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

**Network Use Clause (Section 13):** If you modify the Program and make it accessible over a network (e.g., as a SaaS service), you must provide the complete corresponding source code to all users who interact with it remotely.

**Service Model:**
- **Enterprise Support & SLA** — Guaranteed response times, priority bug fixes, custom integrations
- **Consulting & Training** — Team onboarding, governance policy design, architecture review
- **Managed Enterprise Server** — Centralized telemetry, multi-team budget management, org-wide dashboard

Enterprise inquiries: **ybekar@msn.com**

---

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
