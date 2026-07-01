# [GOV] Atabey — AI Governance & Multi-Agent Platform / Orchestrator (Core Engine)

[![Version](https://img.shields.io/badge/Version-v0.0.20-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey)](https://www.npmjs.com/package/atabey)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Atabey Core Engine** is the CLI and orchestration layer of the Agent Atabey framework. It provides the multi-agent system, governance engines, routing engine, risk assessment, quality gates, evaluation and learning, contract management, phase management, memory systems, skill definitions, and provider integrations.

---

## 📋 Package Overview

| Capability | Description |
|-----------|-------------|
| **CLI** | 30+ commands for initialization, orchestration, status, compliance, memory |
| **Engines** | 15 engines: routing, risk, quality, evaluation, health, planning, phase, contract, policy, discovery, session, agent-executor, agent-loop, crud-governance, file-lock |
| **Agents** | 14 specialized agent definitions with 3-tier hierarchy (Supreme/Core/Recon) |
| **Memory** | 3-layer memory: vector (TF-IDF/OpenAI), project, specialty |
| **Skills** | 7 core skills with 5 platform adapter mappings |
| **Providers** | 7 platform adapters: Claude, Gemini, Cursor, Codex, Antigravity, Grok, Local |
| **Contracts** | Zod-schema task contracts, API contracts |
| **Standards** | 30+ governance standard templates |

---

## 🚀 Installation

```bash
npm install -g atabey
```

## Quick Start

```bash
# Initialize in your project
npx atabey init gemini --profile freelancer --yes

# Verify installation
npx atabey status
```

---

## 🎯 14 Specialized Agents

| Agent | Tier | Capability | Role |
|-------|------|:----------:|------|
| **@manager** | Supreme | 10/10 | Orchestration, governance, quality gate |
| **@security** | Supreme | 10/10 | Security audit, vulnerability scanning |
| **@architect** | Core | 9/10 | System design, contracts, architecture |
| **@backend** | Core | 9/10 | Backend dev, API, business logic, tests |
| **@frontend** | Core | 9/10 | UI, atomic components, responsive design |
| **@quality** | Core | 9/10 | Compliance, lint, test coverage |
| **@database** | Core | 9/10 | Database management, migrations, queries |
| **@analyst** | Recon | 8/10 | Strategy analysis, requirements |
| **@mobile** | Core | 8/10 | React Native mobile development |
| **@native** | Recon | 8/10 | Native platform integration |
| **@devops** | Core | 8/10 | CI/CD, deploy, infrastructure |
| **@explorer** | Recon | 8/10 | Codebase discovery, analysis |
| **@git** | Recon | 8/10 | Version control, commit management |

---

## ⚙️ 15 Engines

| Engine | File | Description |
|--------|------|-------------|
| **RoutingEngine** | `routing-engine.ts` | TF-IDF + Semantic (cosine similarity) task routing with 60/40 blend |
| **RiskEngine** | `risk-engine.ts` | Keyword + path + behavioral risk assessment (requiresApproval ≥ 60) |
| **QualityGate** | `quality-gate.ts` | Compliance AST scan + lint + content validation |
| **EvaluationEngine** | `evaluation-engine.ts` | Post-task scoring (0-100), specialty memory learning |
| **HealthEngine** | `health-engine.ts` | Weighted project health: agent(30%), quality(25%), security(25%), architecture(20%) |
| **PlanningEngine** | `planning-engine.ts` | DAG-based task plan creation + circular dependency detection |
| **PhaseEngine** | `phase-engine.ts` | PHASE_0→PHASE_4 state machine with auto-rollback |
| **ContractEngine** | `contract-engine.ts` | SHA-256 contract hash verification, semver bump |
| **PolicyEngine** | `policy-engine.ts` | API versioning, language policy, file ownership, parallel execution |
| **AgentExecutor** | `agent-executor.ts` | Hermes message-based agent task distribution with 3 retries |
| **AgentLoop** | `agent-loop.ts` | Background polling loop consuming DELEGATION messages |
| **DiscoveryEngine** | `discovery-engine.ts` | Codebase discovery and analysis |
| **SessionEngine** | `session-engine.ts` | Session lifecycle management |
| **CrudGovernance** | `crud-governance.ts` | CRUD operation governance rules |
| **FileLock** | `file-lock.ts` | Distributed file-based locking with TTL |

---

## 🧠 3-Layer Memory System

| Layer | Storage | Technology | Purpose |
|-------|---------|------------|---------|
| **Vector Memory** | SQLite | TF-IDF / OpenAI embeddings + Cosine similarity | Semantic search across project knowledge |
| **Project Memory** | Markdown | `PROJECT_MEMORY.md` | Central project state, synchronized every session |
| **Specialty Memory** | Markdown | `.atabey/memory/specialties/{agent}.md` | Per-agent learned conventions from past tasks |

### Memory Flow
```
Task → Evaluation Engine → Score (0-100)
  ├── Success → extractSuccessLesson() → updateSpecialtyMemory()
  └── Failure → compliance/lint/test lesson → updateSpecialtyMemory()
       ↓
  Next session: readLearnedConventions() → injected into agent prompt
```

---

## 🎯 7 Core Skills

| Skill | Tools | Description |
|-------|-------|-------------|
| **FILE_SYSTEM** | read_file, write_file | Token-efficient file operations |
| **EDITING** | replace_text, patch_file | Surgical code modification |
| **ORCHESTRATION** | orchestrate_loop, send_agent_message, get_framework_status, log_agent_action | Hermes messaging |
| **GOVERNANCE** | acquire_lock, release_lock, register_agent, update_contract_hash | Resource locking & contracts |
| **QUALITY_ASSURANCE** | run_shell_command, view_file | Testing & code quality |
| **DATABASE_MANAGEMENT** | view_file, replace_text, run_shell_command | DB & migrations |
| **DEVOPS_INFRASTRUCTURE** | run_shell_command, view_file | CI/CD & deployment |

### Platform Adapter Skills

| Platform | Skills | Tool Count |
|----------|--------|:----------:|
| **Claude Code** ⭐ | file_system, editing, orchestration, governance, quality, search, memory | 20 tools |
| **Gemini CLI** | file_system, editing, orchestration, governance, quality, search | 14 tools |
| **Cursor IDE** | file_system, editing, search, quality | 9 tools |
| **Codex CLI** | file_system, editing, search, quality | 9 tools |
| **Antigravity CLI** | file_system, editing, orchestration, governance, quality, search | 14 tools |
| **Grok** | file_system, editing, search, quality | 9 tools |
| **Local LLM** | file_system, editing, orchestration, governance, quality, search | 14 tools |

---

## 📚 Knowledge Base (30+ Standards)

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

---

## 🔌 7 Platform Adapters

| Platform | Framework Dir | Agents Dir | Shim File |
|----------|---------------|------------|-----------|
| **Claude Code** | `.claude` | `.claude/agents/*.md` | `CLAUDE.md` |
| **Gemini CLI** | `.gemini` | `.gemini/agents/*.md` | `GEMINI.md` |
| **Cursor IDE** | `.cursor` | `.cursor/rules/*.mdc` | `CURSOR.mdc` |
| **Codex CLI** | `.agents` | `.agents/instructions/*.md` | `copilot-instructions.md` |
| **Antigravity CLI** | `.agents` | `.agents/agents/*.md` | `AGENTS.md` |
| **Grok** | `.grok` | `.grok/agents/*.md` | `GROK.md` |
| **Local LLM** | `.atabey` | `.atabey/agents/*.md` | `LOCAL_AI.md` |

---

## 📋 CLI Reference

```bash
atabey init [adapter]        Initialize Atabey (--profile freelancer|team|enterprise)
atabey mcp start             Start MCP server
atabey mcp install           Generate mcp.json config
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

## 🏗️ Architecture

```
src/
├── cli/
│   ├── commands/        # 30+ CLI commands
│   ├── platforms/       # 7 platform adapters
│   └── utils/           # CLI utilities (compliance, memory, pkg, config)
├── contracts/           # Zod schemas, task/API contracts
├── modules/
│   ├── agents/          # 14 agent definitions + registry
│   ├── contracts/       # Module-level contracts
│   ├── engines/         # 15 governance/orchestration engines
│   ├── memory/          # Vector, project, specialty memory
│   ├── providers/       # 7 LLM provider adapters
│   └── skills/          # 7 core skills + platform mappings
├── schema/              # JSON schemas
├── shared/              # Audit, storage, PII, logger, constants, types
└── templates/
    ├── prompts/         # 9 prompt recipes
    ├── standards/       # 30+ governance standards
    └── full/            # Full constitution template
```

---

## 🔒 Security & Compliance

### KVKK/GDPR Compliance

| Feature | KVKK | GDPR | Status |
|---------|------|------|--------|
| PII Masking (20+ patterns) | Art. 4, 5, 11, 12 | Art. 5, 32 | ✅ |
| Data Retention (30/90 days) | Art. 5, 7 | Art. 5, 17 | ✅ |
| Right to Erasure | Art. 7 | Art. 17 | ✅ |
| Audit Trail | Art. 11 | Art. 30 | ✅ |
| Data Classification | Art. 6 | Art. 9 | ✅ |

### Zero Type Hole Policy
- `any` type usage is **strictly forbidden**
- All function inputs validated with Zod schemas
- Type safety enforced in governance pipeline

---

## 📦 Dependencies

- **atabey-mcp**: MCP Server for tool execution and governance pipeline
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **better-sqlite3**: SQLite database for memory, audit, tasks
- **zod**: Runtime schema validation
- **chalk**: Terminal UI styling
- **ws**: WebSocket for dashboard

---

## License

AGPL-3.0 — Yusuf BEKAR

*Developer: **Yusuf BEKAR** — "Order from Chaos"*
