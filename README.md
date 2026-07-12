# Atabey — MCP-based Multi-Agent Orchestration Tool

> **Language / Dil:** [English](#atabey--mcp-based-multi-agent-orchestration-tool) · [Türkçe](#türkçe)

*Pre-alpha · v0.0.25 · Single-developer project*

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm](https://img.shields.io/npm/v/atabey)](https://www.npmjs.com/package/atabey)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

![Agent Atabey Dashboard Mockup](docs/assets/dashboard.jpg)

**Agent Atabey** is an **AI Governance & Multi-Agent Platform / Orchestrator** built on MCP (Model Context Protocol). It sits on top of your existing AI coding interfaces — Claude Code, Gemini CLI, Cursor, Codex, Grok, Antigravity, or local LLMs — and turns them into a governed, multi-agent software engineering system.

| Layer | Role |
|-------|------|
| **Your AI IDE/CLI** | Writes code, runs tools, executes shell commands |
| **Atabey MCP Server** | 39 tools · multi-layer governance (10+ checks) · orchestration · memory |
| **@manager + 13 specialists** | Delegation, quality gates, risk control, audit trail |
| **`.atabey/` brain hub** | Constitution, memory, knowledge, registry, observability |

> [!NOTE]
> **Project Status (Pre-1.0 / Active Open-Source Experiment):**
> Atabey is currently in **pre-alpha (v0.0.x)** and is actively being developed as an open-source experiment by a single developer. While the core features (TF-IDF routing, regex PII masking, deterministic rules) are functional, it is **not yet production-ready for enterprise environments**.
>
> ⚠️ **Before using or deploying, please review [BLINDSPOTS.md](./BLINDSPOTS.md) for a detailed list of known limitations, security sandboxing issues, and the development roadmap.**

> **Philosophy:** "Order from Chaos"
>
> **What Atabey is:** A deterministic, rule-based governance and multi-agent orchestration middleware for AI coding assistants.
>
> **What Atabey is not:** A standalone LLM runtime (unlike LangGraph/CrewAI) or an AI/ML-driven threat analysis platform. Your connected AI assistant generates the code; Atabey disciplines, routes, validates, and coordinates it using deterministic rule-matching.

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
     │  Multi-Layer Governance Pipeline validates
     │  Quality Gate checks output
     │  Stores in Vector Memory
     │
     ▼
  Returns governed, reviewed, audited code
```

**No separate terminal needed. No CLI commands for daily use.** Just chat with your AI and use `@agent` syntax.

## 🧠 How Atabey Relates to Your AI

> [!IMPORTANT]
> **Atabey does not write code.** The code is written by the AI assistant you are connected to (such as Claude Code, Gemini CLI, or Cursor).
> Atabey wraps your AI assistant with a powerful, deterministic software engineering discipline and governance layer:
>
> 1. **Routing:** Directs instructions to the correct specialized virtual agent profile (`@backend`, `@security`, etc.).
> 2. **Risk Engine:** Automatically scores operations for safety and halts risky actions (like mass deletions) for human approval.
> 3. **Quality Gate:** Reviews the generated output against corporate standards, syntax correctness, and test metrics.
> 4. **Memory:** Keeps track of past architectural decisions and specialty conventions so your AI assistant learns from history.
>
> *We do not mimic the LLM; we discipline it.*

---

## 📋 Table of Contents

- [Platform Architecture](#platform-architecture)
- [Orchestration Flow](#orchestration-flow)
- [Quick Start](#quick-start)
- [MCP Connection (IDE/CLI)](#mcp-connection-idecli)
- [5 Core Capabilities Overview](#5-core-capabilities-overview)
- [How Atabey Plugs Into Your AI](#how-atabey-plugs-into-your-ai)
- [Supported Platforms](#supported-platforms)
- [Installation](#installation)
- [Profile-Based Setup](#profile-based-setup)
- [13 Specialized Agents](#13-specialized-agents)
- [39 MCP Tools](#39-mcp-tools)
- [7 Core Skills](#7-core-skills)
- [3-Layer Memory System](#3-layer-memory-system)
- [Knowledge Base (30+ Standards)](#knowledge-base-30-standards)
- [Multi-Layer Governance Pipeline](#multi-layer-governance-pipeline)
- [Core Features](#core-features)
- [Dashboard](#dashboard)
- [CLI Reference](#cli-reference)
- [Architecture](#architecture)
- [Security](#security)
- [KVKK/GDPR Compliance](#kvkkgdpr-compliance)
- [EU AI Act Alignment](#eu-ai-act-alignment)
- [Token Economy & FinOps](#token-economy--finops)
- [Contributing](#contributing)

---

## Platform Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER / DEVELOPER                                 │
│              @manager planla · @backend API yaz · @quality audit       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ Claude Code   │      │ Gemini CLI    │      │ Cursor IDE    │
│ .claude/      │      │ .gemini/      │      │ .cursor/      │
└───────┬───────┘      └───────┬───────┘      └───────┬───────┘
        │                      │                      │
        └──────────────────────┼──────────────────────┘
                               │ MCP (stdio) — IDE default
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    ATABEY MCP SERVER (atabey-mcp)                        │
│  Governance Pipeline · Hermes Queue · Orchestrator · Vector Memory       │
│  Risk Engine · FinOps · Auto-Rollback · Human-in-the-Loop               │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  .atabey/  Brain & Memory (SSOT)     │  .agents/  Unified Agent Hub    │
│  ATABEY.md · memory/ · knowledge/     │  7 platform mirrors + skills    │
└─────────────────────────────────────────────────────────────────────────┘
```

**Monorepo layout:**

| Package | Purpose |
|---------|---------|
| `packages/atabey` | CLI, adapters, agent export, init |
| `packages/atabey-mcp` | MCP server, governance middleware, dashboard API |
| `packages/shared` | Shared constants, PII, audit, storage (SSOT) |

---

## Orchestration Flow

```mermaid
sequenceDiagram
    participant U as Developer
    participant AI as AI Assistant
    participant MCP as Atabey MCP
    participant M as @manager
    participant S as Specialists
    participant G as Governance

    U->>AI: @manager Plan and deploy Auth module
    AI->>MCP: get_framework_status / read_project_memory
    MCP->>G: PII mask · risk scan
    MCP-->>AI: Phase, trace, agent states

    AI->>MCP: send_agent_message → @backend
    U->>AI: @backend Write JWT service
    AI->>MCP: write_file (governed)
    MCP->>G: Quality gate · auto-rollback snapshot
    MCP-->>AI: Approved output

    AI->>MCP: orchestrate_loop
    MCP-->>AI: Hermes queue processed

    AI->>MCP: send_agent_message → @quality AUDIT
    MCP->>G: Compliance · lint
    MCP-->>AI: APPROVED / REJECTED
```

**Orchestrator auto-start (default):** When your IDE connects to the MCP server (`mcp.json`), Atabey automatically boots the headless **AgentLoop** orchestrator in the background. No separate terminal is required for daily multi-agent work.

```bash
# Optional — interactive TUI dashboard loop
npx atabey orchestrate

# Optional — unified HTTP server + dashboard UI
MCP_TRANSPORT=unified MCP_PORT=5858 npx atabey-mcp
```

Disable auto-start: set `"orchestrator": { "autoStart": false }` in `.atabey/config.json` or `ATABEY_AUTO_START_ORCHESTRATOR=false` in `mcp.json`.

### Project kinds

| Kind | Where | App paths (`apps/backend`, `apps/web`) |
|------|-------|----------------------------------------|
| **consumer** | Your application repo after `atabey init` | ✅ Scaffolded by init |
| **framework-monorepo** | This GitHub repository (`packages/*`) | ❌ Not applicable — use `packages/atabey`, `packages/atabey-mcp/dashboard` |

---

## Quick Start

### 1. Initialize Atabey in Your Project

> **Consumer projects:** `atabey init` scaffolds `apps/backend`, `apps/web`, `docs/`, etc.
> The **Atabey framework monorepo** itself does not contain `apps/*` — those paths appear only after you install Atabey in your own application repository.

```bash
# Single platform (your app repo)
npx atabey init gemini --profile freelancer --yes

# All 7 platforms (recommended for teams)
npx atabey init gemini --unified --profile team --yes

# Framework monorepo maintainers only (this repository)
npm install          # postinstall runs atabey:setup if .atabey/ is missing
npm run atabey:setup # or run manually
```

### 2. Verify MCP & Platform Health

```bash
npx atabey check     # MCP transport, unified layout, AL registry, compliance
npx atabey status    # Phase, trace, agent states
```

### 3. Connect to Your AI Interface (MCP auto-starts)

`atabey init` generates `mcp.json` with **`MCP_TRANSPORT=stdio`** and **`ATABEY_AUTO_START_ORCHESTRATOR=true`**. Your IDE spawns the MCP server automatically — orchestrator included. Point your AI assistant to it:

**Claude Code:**
```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "ATABEY_PROJECT_ROOT": "/path/to/your/project",
        "ATABEY_AUTO_START_ORCHESTRATOR": "true"
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

**Cursor** (`.cursor/mcp.json` — auto-generated by init):

```json
{
  "mcpServers": {
    "atabey": {
      "command": "node",
      "args": ["node_modules/atabey-mcp/dist/atabey-mcp/src/mcp/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "ATABEY_PROJECT_ROOT": "/path/to/your/project",
        "ATABEY_AUTO_START_ORCHESTRATOR": "true"
      }
    }
  }
}
```

> [!IMPORTANT]
> **MCP transport modes**
> - **`stdio`** (default) — Claude, Cursor, Gemini, Codex, Grok. Set by `atabey init` and `atabey mcp install`.
> - **`unified`** — HTTP/SSE server on port 5858 for dashboard and remote clients: `MCP_TRANSPORT=unified MCP_PORT=5858 atabey-mcp`
>
> Repair a broken config: `atabey mcp install`

---

## MCP Connection (IDE/CLI)

| Step | Command | Result |
|------|---------|--------|
| Init | `atabey init gemini --unified --yes` | Agents + 7 adapter MCP configs + shims |
| Repair | `atabey mcp install` | Refreshes root `mcp.json` (stdio + auto-orchestrator) |
| IDE connect | Open Claude / Cursor / Gemini | MCP + orchestrator start automatically |
| Debug | `atabey mcp start` | Manual stdio MCP for troubleshooting |
| Health | `atabey check` | Validates `MCP_TRANSPORT`, unified layout, AL registry |

**Platform orchestration strength:**

| Platform | Orchestration | Best role |
|----------|---------------|-----------|
| Claude Code | Full (7 skills) | Primary orchestrator |
| Gemini CLI | Strong (6 skills) | Commander / strategist |
| Local LLM | Strong | Offline / private |
| Antigravity CLI | Strong | Custom agent JSON |
| Cursor / Grok / Codex | Limited (4 skills) | Implementer / editor |

### 4. Start Using in AI Chat

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
| 🛠️ | **39 MCP Tools** | File system, search, messaging, governance, memory, quality, network, orchestration | 82/100 |
| 🧠 | **3-Layer Memory** | Vector Memory (TF-IDF/OpenAI), Project Memory, Specialty Memory (agent learning) | 78/100 |
| 🤖 | **13 Specialized Agents** | 3-tier hierarchy (Supreme/Core/Recon) with state machine | 80/100 |
| 🎯 | **7 Core Skills** | Platform-adaptive skills for 7 different AI platforms | 72/100 |
| 📚 | **30+ Knowledge Standards** | Governance, security, architecture, compliance, deployment standards | 85/100 |
| **🎯** | **Overall** | **AI Governance & Multi-Agent Platform / Orchestrator** | **74/100** |

> Scores reflect pre-1.0 maturity: strong governance and MCP tooling; orchestration depth varies by platform adapter.

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
│   │  39 Tools · Multi-Layer Governance Pipeline ·               │   │
│  │  Risk Engine · Loop Detection · FinOps · Auto-Rollback  │   │
│   └──────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────┤
│                    GOVERNANCE LAYER                                │
│   Quality Gate → Risk Engine → Vector Memory → Audit Log         │
│   PII Masking → Discipline → License Scan → Injection Protection │
└──────────────────────────────────────────────────────────────────┘
```

Atabey is **not a separate execution engine**. It is a context-aware governance and policy middleware that intercepts, validates, and routes the actions of AI coding assistants:
- **13 Specialized Agent Contexts** (injected templates to structure AI reasoning)
- **Deterministic Quality Gates** (AST analysis + lint + governance validation)
- **Risk Gate & Heuristic Scanning** (blocking dangerous commands, requiring human approval)
- **Persistent Vector Memory** (TF-IDF + OpenAI embeddings, cosine similarity search)
- **Audit trails** (every action logged, supporting KVKK/GDPR technical alignment)

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

### Native Dependency & CI/CD Considerations

Atabey utilizes `better-sqlite3` for local state persistence and high-performance vector operations. Since `better-sqlite3` includes native C++ modules, it requires binary compilation during installation under certain environments.

If you encounter installation or test run issues (especially in restricted sandbox or CI/CD environments with no internet access or build tools):

1. **Prebuilt Binaries:** npm will automatically try to download prebuilt binaries for your platform. Ensure your environment has outgoing network access to the GitHub/npmjs package registries.
2. **Build Tools:** Ensure you have `python`, `make`, and a C++ compiler (like `gcc`/`g++`) installed on your system if you need to build from source.
3. **CI/CD Environments:** For CI/CD test runners, you can bypass native sqlite3 compile-time issues by running with the `--ignore-scripts` flag if you only need the static analysis and typescript compilation checks:
   ```bash
   npm install --ignore-scripts
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
| **Dashboard** | Extensive live modules (Agent Monitor, Hermes, Approvals, Compliance, FinOps, Loop Detector, Memory, etc.) with WebSocket real-time updates |
| **Governance** | Quality gate + risk engine + contract validation |
| **Best For** | Small-medium teams with governance needs |

### `--profile enterprise` (15+ people)

```bash
npx atabey init gemini --profile enterprise
```

| Feature | What You Get |
|---------|-------------|
| **Agents** | All 13 agents (Supreme + Core + Recon) |
| **Setup Time** | ~1 minute |
| **Security** | Human-in-the-Loop, KVKK PII masking, audit log |
| **Governance** | Full governance with circuit breakers |
| **Best For** | Enterprise with compliance requirements |

---

## 13 Specialized Agents

> [!NOTE]
> **Execution Model:** Atabey's specialized agents are virtual profiles powered by dynamically injected system role definitions and context templates. They do not run as 13 parallel, independent LLM API instances. Instead, your single host AI assistant (e.g., Claude Code, Gemini CLI) takes on these roles sequentially, routed by the TF-IDF engine, while Atabey enforces boundaries, state machine constraints, and quality checks during role switches.

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

## 39 MCP Tools

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

## Multi-Layer Governance Pipeline

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
Per-agent token/cost tracking via MCP governance middleware. Budget enforcement is **config-driven** in `.atabey/config.json` (`finops` section) and auto-starts with the MCP server. See [Token Economy & FinOps](#token-economy--finops).

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
atabey init [adapter]           Initialize Atabey (--profile freelancer|team|enterprise)
atabey mcp start|install        MCP server management
atabey dashboard [port]         Open web dashboard (default: 5858)
atabey orchestrate              Start orchestration loop
atabey check                    System health check
atabey status                   Show agent statuses and costs
atabey plan [submit <json>]     Task planning
atabey approve <traceId>        Approve blocked high-risk task
atabey trace new|replay <id>    Execution traces
atabey memory update <sect> <c> Update project memory
atabey git commit|sync          Git operations
atabey explorer graph|audit     Code analysis
atabey security <path>          Security audit
atabey compliance <path>        Run compliance check
atabey contract                 Verify contract integrity
atabey lint                     Run ESLint
atabey knowledge <query>        Knowledge base search
atabey log <agent> <msg>        View agent logs
atabey script <name> [dir]      Run predefined script
atabey index [dir]              Index codebase for RAG
atabey coverage                 Test coverage reports
atabey quickstart               Generate example task file
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
│                    39 Tools · Multi-Layer Governance                │
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

### Deterministic & Rule-Based Governance
Deterministic rules: AST compliance parsing, strict TypeScript type validation (zero `any`), and automated governance checks.

### Zero Type Hole Policy
- `any` type usage is **strictly forbidden**
- All function inputs validated with Zod schemas
- Type safety enforced in governance pipeline

### PII Masking (KVKK/GDPR Technical Alignment)
- All logs scanned for Personally Identifiable Information
- Sensitive data automatically masked (20+ patterns)
- Designed to assist with Turkish KVKK (Law No. 6698) and EU GDPR controls
- **Right to Erasure** (KVKK Art. 7 / GDPR Art. 17) technical support

### Human-in-the-Loop
- Risk score ≥ 60 requires human approval
- In-chat approval: `approve_operation` MCP tool
- Terminal fallback: `atabey approve <traceId>`

### AI Discipline Engine
- Rate Limiting: Max 60 calls/minute per agent
- File Size Limits: Prevents >1MB files
- Loop Detection: Blocks >10 consecutive same-tool calls
- Cooldown Mechanism: Automatic when limits exceeded
- Injection Protection: Aligned with OWASP LLM01 guidelines

---

## KVKK/GDPR Technical Alignment

> **Scope:** Technical compliance tooling — not legal certification. Pair with your DPO/legal counsel for production deployments.

| Feature | KVKK | GDPR | Status |
|---------|------|------|--------|
| PII Masking (20+ patterns) | Art. 4, 5, 11, 12 | Art. 5, 32 | ✅ Implemented |
| Data Retention (30/90 days) | Art. 5, 7 | Art. 5, 17 | ✅ Auto-cleanup on MCP boot |
| Right to Erasure | Art. 7 | Art. 17 | ✅ `/api/audit/erase` + trace erase |
| Audit Trail | Art. 11 | Art. 30 | ✅ SQLite audit log |
| Data Classification | Art. 6 | Art. 9 | ✅ Category-based retention |
| Consent Logging | Art. 5 | Art. 7 | ✅ `.atabey/compliance/consent-log.json` |

Configure in `.atabey/config.json`:

```json
{
  "compliance": {
    "retentionEnabled": true,
    "consentLogging": true,
    "piiMasking": true,
    "dataProcessingBasis": "consent"
  }
}
```

Dashboard API: `GET /api/compliance/consent`, `GET /api/compliance/retention`

---

## EU AI Act Alignment

Atabey provides **process and governance alignment** with the EU AI Act via `.atabey/knowledge/llm-governance.md` (scaffolded on `atabey init`):

| EU AI Act principle | Atabey implementation |
|---------------------|----------------------|
| Human oversight | Human-in-the-Loop, risk score ≥ 60 → approval |
| Risk classification | High-risk ops (auth, billing, moderation) gated by `@manager` |
| Transparency | AI-generated output labeling rules in llm-governance |
| Data protection | PII masking, retention, erasure (KVKK/GDPR layer) |
| Robustness & safety | Loop detection, injection protection (OWASP LLM01), auto-rollback |

> **Not included:** CE marking, conformity assessment, DPIA templates, or legal EU AI Act certification. Use Atabey as a **technical control layer** alongside legal review.

---

## Token Economy & FinOps

FinOps **auto-starts** when the MCP server boots. Defaults are profile-based:

| Profile | Tracking | Budget enforcement |
|---------|----------|-------------------|
| `freelancer` | ✅ Always | ❌ Off (track only) |
| `team` | ✅ Always | ❌ Off by default |
| `enterprise` | ✅ Always | ✅ $500/mo default |

Configure in `.atabey/config.json`:

```json
{
  "finops": {
    "tracking": true,
    "enforcement": true,
    "monthlyBudgetUsd": 200,
    "agentMaxBudgetUsd": 40,
    "team": "my-team",
    "alertThresholds": [50, 80, 90, 100],
    "costPer1kTokensUsd": 0.003
  }
}
```

Environment overrides (optional):

```bash
ATABEY_BUDGET_ENABLED=true
ATABEY_BUDGET_MONTHLY=200
ATABEY_BUDGET_AGENT_MAX=40
```

- **Tracking mode:** logs estimated tokens per MCP tool call, exposes `/api/finops`
- **Enforcement mode:** blocks tool calls when monthly/agent budget exceeded
- **Alerts:** stderr warnings at 50/80/90/100% thresholds

Check status: `atabey status` · Dashboard: `GET /api/finops`

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

---

# Türkçe — Agent Atabey

> **Dil notu:** Proje **kodu, şablonları, standartları, CLI metinleri ve ajan tanımları İngilizcedir**. Yalnızca bu kök `README.md` hem İngilizce hem Türkçe sunulur. Paket README dosyaları (`packages/*/README.md`) İngilizcedir.

## Agent Atabey nedir?

**Agent Atabey**, MCP (Model Context Protocol) üzerine kurulu bir **AI Yönetişim ve Çok-Ajan Platformu / Orkestratörüdür**. Claude Code, Gemini CLI, Cursor, Codex, Grok, Antigravity veya yerel LLM gibi mevcut AI kodlama arayüzlerinizin üzerine oturur; onları yönetişimli, çok-ajanlı bir yazılım mühendisliği sistemine dönüştürür.

| Katman | Rol |
|--------|-----|
| **AI IDE/CLI’niz** | Kod yazar, tool çalıştırır, shell komutları yürütür |
| **Atabey MCP Server** | ~39 tool · çok katmanlı yönetişim · orkestrasyon · bellek |
| **@manager + 13 uzman** | Delegasyon, kalite kapısı, risk kontrolü, denetim izi |
| **`.atabey/` beyin merkezi** | Anayasa, bellek, knowledge, registry, gözlemlenebilirlik |

> [!NOTE]
> **Proje durumu (Pre-1.0 / açık kaynak deneyi):** Atabey şu an **pre-alpha (v0.0.x)** aşamasındadır ve tek geliştirici tarafından aktif geliştirilmektedir. Çekirdek özellikler (TF-IDF routing, regex PII maskeleme, deterministik kurallar) çalışır; **kurumsal üretim ortamları için henüz hazır değildir**.
>
> Kullanmadan önce bilinen sınırlar için [BLINDSPOTS.md](./BLINDSPOTS.md) dosyasını okuyun.

> **Felsefe:** “Kaostan Nizam” / *Order from Chaos*
>
> **Atabey nedir:** AI kodlama asistanları için deterministik, kural tabanlı yönetişim ve çok-ajan orkestrasyon middleware’i.
>
> **Atabey ne değildir:** Bağımsız bir LLM runtime (LangGraph/CrewAI gibi) veya ML tabanlı tehdit analiz platformu değildir. Kodu bağlı AI asistanı üretir; Atabey yönlendirir, disipline eder, doğrular ve koordine eder.

---

## Nasıl çalışır?

Atabey, AI arayüzünüze **MCP tool sunucusu** olarak bağlanır. Bağlandıktan sonra sohbette `@agent` komutlarını kullanırsınız:

```
Siz (@backend): "JWT kimlik doğrulamalı kullanıcı login servisi yaz"
     │
     ▼
  Atabey MCP Server (atabey-mcp/)
     │  @agent komutunu yakalar
     │  RoutingEngine ile yönlendirir (TF-IDF + semantik)
     │  @backend uzmanına yollar
     │  Yönetişim pipeline doğrular
     │  Quality Gate çıktıyı kontrol eder
     │  Vector Memory’e kaydeder
     │
     ▼
  Yönetilmiş, denetlenmiş, izli kod döner
```

Günlük kullanımda ayrı bir terminal gerekmez. AI sohbetinde `@agent` sözdizimi yeterlidir.

**Önemli:** Atabey kod yazmaz. Kodu Claude Code / Gemini / Cursor gibi bağlı asistan yazar. Atabey:

1. **Routing** — doğru uzman profile (`@backend`, `@security`, …)
2. **Risk Engine** — tehlikeli işlemleri skorlar, gerekirse insan onayı ister
3. **Quality Gate** — standartlara, sözdizimine, test metriklerine göre denetler
4. **Memory** — mimari kararlar ve uzmanlık geçmişini tutar

---

## Platform mimarisi

```
Kullanıcı / Geliştirici
  → Claude Code / Gemini CLI / Cursor IDE
  → MCP (stdio)
  → Atabey MCP Server
       Yönetişim · Hermes kuyruk · Orchestrator · Vector Memory
       Risk · FinOps · Auto-Rollback · Human-in-the-Loop
  → .atabey/  (beyin)  ·  .agents/  (birleşik ajan hub)
```

**Monorepo paketleri:**

| Paket | Amaç |
|-------|------|
| `packages/atabey` | CLI, adapter’lar, ajan export, init |
| `packages/atabey-mcp` | MCP sunucu, yönetişim middleware, dashboard API |
| `packages/shared` | Ortak constants, PII, audit, storage (SSOT) |

---

## Hızlı başlangıç

```bash
# Tek platform
npx atabey init gemini --profile freelancer --yes

# 7 platform (ekip için önerilir)
npx atabey init gemini --unified --profile team --yes

# Sağlık kontrolü
npx atabey check
npx atabey status
```

**MCP bağlama (özet — Claude / Cursor):**

```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "ATABEY_PROJECT_ROOT": "/path/to/your/project",
        "ATABEY_AUTO_START_ORCHESTRATOR": "true"
      }
    }
  }
}
```

Sohbette:

```
@backend Create a REST API for user management with CRUD operations
@security Audit the authentication middleware
@quality Run compliance check on the new feature
```

> **İçerik dili:** Oluşturulan anayasa, standartlar, ajan talimatları ve CLI metinleri **İngilizcedir**. `--lang` bayrağı içerik dilini değiştirmez (geriye dönük uyumluluk için kabul edilebilir).

---

## 5 temel yetenek

| # | Yetenek | Açıklama |
|---|---------|----------|
| 🛠️ | **~39 MCP Tool** | Dosya sistemi, arama, mesajlaşma, yönetişim, bellek, kalite, ağ, orkestrasyon |
| 🧠 | **3 katmanlı bellek** | Vector (TF-IDF/OpenAI), Project Memory, Specialty Memory |
| 🤖 | **13 uzman ajan** | Supreme / Core / Recon hiyerarşisi |
| 🎯 | **7 core skill** | 7 AI platformuna uyarlanan skill setleri |
| 📚 | **30+ knowledge standard** | Yönetişim, güvenlik, mimari, test, deployment |

---

## Desteklenen platformlar

| Platform | MCP | Not |
|----------|-----|-----|
| Claude Code | `.mcp.json` | En güçlü orkestrasyon |
| Gemini CLI | `.gemini/mcp.json` | Güçlü komutan / stratejist |
| Cursor | `.cursor/mcp.json` | Implementer / editör |
| Codex / Copilot | `.vscode/mcp.json` | Sınırlı skill seti |
| Antigravity | `.agents/mcp_config.json` | Custom agent JSON |
| Grok | `.grok/mcp_config.json` | Sınırlı skill seti |
| Local LLM | `.atabey/mcp_config.json` | Offline / private |

```bash
npx atabey init claude --unified   # tüm platformlara export
```

---

## Kurulum gereksinimleri

| Gereksinim | Sürüm |
|------------|--------|
| Node.js | >= 18 |
| npm | >= 9 |
| AI arayüzü | Claude, Gemini, Cursor, Codex, Grok, Antigravity veya local LLM |

```bash
npm install -g atabey
npx atabey init gemini --profile freelancer --yes
npx atabey status
npx atabey dashboard   # opsiyonel web UI (port 5858)
```

`better-sqlite3` native bağımlılıktır; CI’da derleme sorunlarında `npm install --ignore-scripts` ve önceden derlenmiş binary’ler gerekebilir.

---

## Profiller

| Profil | Kim için | Ne gelir |
|--------|----------|----------|
| `--profile freelancer` | 1–3 kişi | Az ajan, düşük sürtünme |
| `--profile team` | 5–15 kişi | 5–8 odak ajanı, unified önerilir |
| `--profile enterprise` | 15+ | Tam 13 ajan, sıkı yönetişim |

Odak: `--focus fullstack|backend|frontend|mobile`

---

## 13 uzman ajan (özet)

| Ajan | Katman | Rol |
|------|--------|-----|
| `@manager` | Supreme | Orkestrasyon, onay zinciri |
| `@security` | Supreme | Güvenlik denetimi |
| `@architect` | Core | Tasarım, kontratlar |
| `@backend` / `@frontend` | Core | API / UI |
| `@quality` | Core | Uyumluluk, lint, coverage |
| `@database` / `@devops` | Core | Veri / CI-CD |
| `@analyst` / `@mobile` / `@native` | Core | Strateji / mobil / native |
| `@explorer` / `@git` | Recon | Keşif / versiyon kontrol |

---

## MCP tool grupları

- **Dosya sistemi:** read/write, replace, patch, batch edit
- **Shell:** allow-list’li `run_shell_command` (+ opsiyonel uid/gid sandbox)
- **Arama:** list_dir, grep, project map/gaps
- **Mesajlaşma:** send_message, ask_human, approve, log
- **Bellek / knowledge:** store/search/delete, insights
- **Framework:** status, orchestrate, plan, tests, audit_deps
- **Kalite / compliance / control plane / observability / network**

---

## 3 katmanlı bellek

1. **Vector Memory** — TF-IDF veya OpenAI embedding + cosine
2. **Project Memory** — `PROJECT_MEMORY.md`
3. **Specialty Memory** — ajan bazlı öğrenilmiş dersler

---

## Yönetişim pipeline (özet)

Her tool çağrısında (pre/post): PII mask → schema validation → rules → discipline → silent routing → CRUD governance → loop detection → FinOps → license → auto-rollback snapshot → risk/HITL → **execute** → response checks → injection sanitize → audit / WebSocket.

Yerel, harici bağımlılıksız ek katmanlar:

- **In-memory Job Queue** — eşzamanlı ajan işi sınırı
- **Worker threads pool** — CPU işleri
- **Atomic file lock (`wx`)** — dosya yarışları
- **uid/gid sandbox** — shell izolasyonu (yapılandırıldığında)
- **Circuit breaker + exponential backoff** — geçici hata dayanıklılığı

---

## Dashboard

```bash
npx atabey dashboard
# veya
MCP_TRANSPORT=unified MCP_PORT=5858 npx atabey-mcp
```

Paneller: Agents, Hermes, HITL Approvals, Plans, Logs, Quality, FinOps, Loop Detector, License, Telemetry, Memory, Compliance, …

---

## CLI (seçme)

| Komut | Açıklama |
|-------|---------|
| `atabey init …` | Proje iskeleti + adapter export |
| `atabey check` / `status` | Sağlık / ajan durumu |
| `atabey mcp start\|install` | MCP yönetimi |
| `atabey orchestrate` | Etkileşimli orkestrasyon döngüsü |
| `atabey plan` / `approve` / `trace` | Plan, onay, iz |
| `atabey memory` / `knowledge` | Bellek / bilgi bankası |
| `atabey dashboard` | Web UI |

---

## Güvenlik ve uyumluluk (dürüst özet)

- Allow-list shell, risk skoru, HITL, PII maskeleme, loop detection
- **Sandbox varsayılan kapalıdır** — `ATABEY_SANDBOX_UID` / `USER` ile açılır
- KVKK / GDPR / EU AI Act: teknik hizalama kontrolleri vardır; yasal “tam uyumluluk” iddiası yoktur
- Detay: [SECURITY.md](./SECURITY.md), [PRIVACY.md](./PRIVACY.md), [BLINDSPOTS.md](./BLINDSPOTS.md)

---

## FinOps

Token tahmini kabaca `metin uzunluğu / 4`’tür; gerçek tokenizer faturalaması değildir. Bütçe uyarıları `config.json` / env ile yapılandırılır.

---

## Test ve katkı

```bash
npm test
npm run test:watch
npm run test:coverage
```

Katkı süreci: [CONTRIBUTING.md](./CONTRIBUTING.md)

```bash
git clone https://github.com/ysf-bkr/atabey.git
cd atabey && npm install && npm run build
```

---

## Lisans ve iş modeli

**Kod:** AGPL-3.0 — Yusuf BEKAR

Ağ üzerinden (SaaS) sunulursa kaynak kod paylaşımı gerekir (AGPL §13).

**Hizmet:** kurumsal destek/SLA, danışmanlık/eğitim, yönetilen enterprise sunucu.
İletişim: **ybekar@msn.com**

---

*Geliştirici: **Yusuf BEKAR** — “Order from Chaos”*
