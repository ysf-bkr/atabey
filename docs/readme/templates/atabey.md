# Atabey — Local AI Control Plane & Discipline Layer (Core Engine)

[![Version](https://img.shields.io/badge/Version-v{{VERSION}}-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey)](https://www.npmjs.com/package/atabey)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Atabey Core Engine** is the CLI and orchestration layer of the Atabey framework: the multi-agent system, governance engines, routing engine, risk assessment, quality gates, evaluation & learning, contract management, phase management, memory systems, skill definitions and provider integrations.

<!-- include: ../fragments/what-is-atabey.md -->

---

## 📋 Package Overview

| Capability | Description |
|-----------|-------------|
| **CLI** | 31 commands for initialization, orchestration, status, compliance and memory |
| **Engines** | 9 engines: routing, risk, quality, evaluation, health, planning, agent-executor, agent-loop, crud-governance |
| **Agents** | 13 specialized agent definitions with a 3-tier hierarchy (Supreme / Core / Recon) |
| **Runtime** | Headless CLI adapters, DAG dispatcher, git-worktree isolation, signed evidence bundles |
| **Memory** | 3-layer memory: vector (TF-IDF/OpenAI), project, specialty |
| **Skills** | 15 core skills in `skills/<slug>/SKILL.md` format, mapped across 7 platform adapters |
| **Providers** | 7 platform adapters: Claude (default), Cursor, Codex, Antigravity, Grok, Local LLM, OpenCode |
| **Contracts** | Zod-schema task contracts and API contracts |
| **Standards** | 33 governance standard templates |

---

## 🚀 Installation

```bash
npm install -g atabey
```

## Quick Start

```bash
# Initialize Atabey for one AI platform (claude is the default)
npx atabey init claude --yes

# …or for every supported AI at once
npx atabey init all --yes

# Verify
npx atabey status
```

---

## 🎯 13 Specialized Agents

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
| **@native** | Recon | 8/10 | Native platform integration (Rust/Go only) |
| **@devops** | Core | 8/10 | CI/CD, deploy, infrastructure |
| **@explorer** | Recon | 8/10 | Codebase discovery, analysis |
| **@git** | Recon | 8/10 | Version control, commit management |

---

## ⚙️ 9 Engines

| Engine | File | Description |
|--------|------|-------------|
| **RoutingEngine** | `routing-engine.ts` | TF-IDF + semantic (cosine similarity) task routing, 60/40 blend |
| **RiskEngine** | `risk-engine.ts` | Keyword + path + behavioral risk assessment (requires approval ≥ 60) |
| **QualityGate** | `quality-gate.ts` | Compliance AST scan + lint + content validation |
| **EvaluationEngine** | `evaluation-engine.ts` | Post-task scoring (0–100), specialty-memory learning |
| **HealthEngine** | `health-engine.ts` | Weighted project health: agent 30% · quality 25% · security 25% · architecture 20% |
| **PlanningEngine** | `planning-engine.ts` | DAG-based task plan creation + circular-dependency detection |
| **AgentExecutor** | `agent-executor.ts` | Hermes message-based agent task distribution with 3 retries |
| **AgentLoop** | `agent-loop.ts` | Background polling loop consuming DELEGATION messages |
| **CrudGovernance** | `crud-governance.ts` | CRUD / administrative operation governance rules |

> Contract, policy, phase and session logic lives in the CLI commands and `atabey-shared`;
> atomic file locking is `AtomicFileLock` in `packages/shared`.

<!-- include: ../fragments/memory.md -->

---

## 🎯 15 Core Skills

| Skill | Tools | Description |
|-------|-------|-------------|
| **FILE_SYSTEM** | read_file, write_file | Token-efficient file operations |
| **EDITING** | replace_text, patch_file | Surgical code modification |
| **ORCHESTRATION** | orchestrate_loop, send_agent_message, get_framework_status, log_agent_action | Hermes messaging |
| **GOVERNANCE** | acquire_lock, release_lock, register_agent, update_contract_hash | Resource locking & contracts |
| **QUALITY_ASSURANCE** | run_shell_command, read_file | Testing & code quality |
| **DATABASE_MANAGEMENT** | read_file, replace_text, run_shell_command | DB & migrations |
| **DEVOPS_INFRASTRUCTURE** | run_shell_command, read_file | CI/CD & deployment |
| **SECURITY_AUDIT** | grep_search, read_file, http_proxy_request | Vulnerability assessment |
| **FRONTEND_DEVELOPMENT** | write_file, replace_text, run_shell_command | UI & component design |
| **MOBILE_DEVELOPMENT** | write_file, replace_text | Mobile & cross-platform |
| **GIT_WORKFLOW** | run_shell_command, git | Version control discipline |
| **SOCRATIC_ANALYSIS** | read_file, grep_search, ask_human | Assumption stress-testing & pre-mortem analysis |
| **SPECIFICATION_DESIGN** | read_file, write_file, patch_file | Formal specification & contract engineering |
| **DUAL_AXIS_REVIEW** | read_file, grep_search, run_shell_command | Code quality & specification-fidelity review |
| **SCIENTIFIC_DIAGNOSTICS** | read_file, replace_text, patch_file, run_shell_command | Hypothesis-driven bug diagnostics |

### Platform Adapter Skills

All 15 core skills are scaffolded for every platform; the delivery format differs:

| Platform | Skill format |
|----------|--------------|
| **Claude Code** ⭐ | Native skills (`skills/<slug>/SKILL.md`) |
| **Cursor IDE** | MDC ruleset |
| **Codex CLI** | Injected prompt |
| **Antigravity CLI** | Native toolset |
| **Grok** | Context shims |
| **Local LLM** | Markdown specs (`.atabey/agents/`) |
| **OpenCode** | Native toolset |

---

## 📚 Knowledge Base (30+ Standards)

| Category | Standards |
|----------|-----------|
| **Governance** | governance-standards, llm-governance, crud-governance, token-economy |
| **Architecture & API** | architecture-standards, auth-standards, swagger-standards |
| **Development** | frontend-standards, nextjs-standards, vite-standards, kysely-standards |
| **Mobile & Native** | mobile-standards, android-standards, ios-standards, mobile-notifications-standards, native-standards |
| **Security** | security-standards, security-audit-standards, logging-and-secrets |
| **DevOps** | deployment-standards, github-actions-standards |
| **Quality** | quality-standards, testing-standards, vitest-standards, playwright-standards, eslint-standards |
| **Performance & Observability** | performance-standards, observability-standards, pino-standards |
| **UI/UX** | tailwind-standards, react-query-standards, react-router-standards, i18n-standards |
| **Data** | typeorm-standards |
| **Reporting** | reporting-standards, enterprise-systems-standards |

<!-- include: ../fragments/platforms.md -->

---

## 📋 CLI Reference

```bash
atabey update                 Refresh scaffold after upgrade (preserves memory)
atabey init [ai]             Initialize Atabey for one AI (claude default) or all
atabey mcp start|install     MCP server management
atabey status                Show agent statuses and token usage
atabey check                 Full health and compliance check
atabey orchestrate           Start the orchestration workflow loop
atabey approve <traceId>     Approve a blocked high-risk task
atabey hitl status|answer|approve|reject   HITL responses & approvals
atabey trace new|replay <id> Create/replay an execution trace
atabey plan [submit <json>]  Create/submit a task plan
atabey memory update <sect> <content>      Update project memory
atabey git commit|sync       Git operations
atabey explorer graph|audit  Explore / audit the codebase
atabey knowledge <query>     Knowledge base search
atabey log [@agent]          View agent logs
atabey script <name> [dir]   Run a predefined script
atabey security [path]       Run a security audit
atabey compliance [path]     Run a compliance check
atabey contract verify|update          Contract integrity (update re-syncs hash)
atabey lint                  Run ESLint
atabey db <status|migrate|verify|backup|restore>   SQLite schema, integrity & backups
atabey secrets <list|set|get|delete|scan>          AES-256-GCM secret vault & leak scan
atabey api <scan|list|drift|json>                  API endpoint catalog & contract drift
atabey audit export|erase                          Signed audit export / KVKK-GDPR erasure
atabey worktree <create|list|remove> [name]        Isolated agent worktrees
atabey index [dir]           Index the codebase for RAG
atabey coverage              Test coverage reports
atabey quickstart            Generate an example task file
```

### `atabey init [adapter]` Options

| Option | Values | Description |
|--------|--------|-------------|
| `[ai]` | `claude` (default), `cursor`, `codex`, `grok`, `local`, `antigravity-cli`, `opencode`, `all` | Target AI platform; `all` compiles for every supported AI |
| `--focus` | `fullstack`, `backend`, `frontend`, `mobile`, `mobile-fullstack` | Project type optimization |
| `--backend` / `--frontend` / `--native` | `node|go|java|python|dotnet|rust` / `vite|next|vanilla` / `rust|go` | Application-tier scaffolding |
| `--lang` | `tr`, `en` | Deprecated no-op (kept for backward compatibility) — all generated content is English-only |
| `--import-docs` | Flag | Non-interactive: import root-level project docs into `.atabey/knowledge/imported/` |
| `--skip-index` | Flag | Skip the automatic post-init RAG + symbol-graph indexing |
| `--yes` | Flag | Non-interactive mode |

> One canonical setup: all 13 specialists, strictest governance posture — no freelancer/team/enterprise profiles.

---

## 🏗️ Architecture

```
packages/atabey/
├── src/
│   ├── cli/
│   │   ├── commands/    # 31 CLI commands
│   │   ├── platforms/   # 7 platform adapters
│   │   └── utils/       # CLI utilities (compliance, memory, pkg, config)
│   ├── modules/
│   │   ├── agents/      # 13 agent definitions + registry
│   │   ├── audit/       # HMAC-signed audit export
│   │   ├── contracts/   # Task/API contracts (Zod)
│   │   ├── engines/     # 9 governance/orchestration engines
│   │   ├── memory/      # Vector, project, specialty memory
│   │   ├── providers/   # 7 platform provider adapters
│   │   ├── runtime/     # Headless CLI runtime, DAG dispatcher, worktrees
│   │   └── skills/      # 15 core skills
│   ├── schema/          # JSON schemas
│   └── shared/          # Audit, storage, PII, logger, constants, types
└── templates/
    ├── prompts/         # 14 prompt recipes
    ├── standards/       # 36 governance standards
    └── full/            # Full constitution template
```

<!-- include: ../fragments/core-capabilities.md -->

<!-- include: ../fragments/security-compliance.md -->

<!-- include: ../fragments/token-efficiency.md -->

---

## 📦 Dependencies

- **atabey-shared**: Shared constants, storage, PII masking, audit and locking primitives
- **atabey-mcp** _(optional)_: MCP server enabling `atabey mcp start` and the HTTP/SSE transport
- **better-sqlite3**: SQLite database for memory, audit and tasks
- **zod**: Runtime schema validation
- **chalk**: Terminal UI styling
- **js-yaml**: YAML parsing for the agent-registry validator
- **typescript**: TypeScript Compiler API for AST compliance scanning

<!-- include: ../fragments/related.md -->

<!-- include: ../fragments/license.md -->
