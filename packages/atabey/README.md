# Atabey — Local Governance & Verification for AI Coding Agents (Core Runtime)

[![Version](https://img.shields.io/badge/Version-v0.1.7-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey)](https://www.npmjs.com/package/atabey)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Atabey Core** is the CLI and runtime package of the Atabey framework. It handles project
setup, task orchestration, risk assessment, quality gates, contract management, memory,
skill definitions and provider integrations.

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
| **CLI** | 31 commands for initialization, orchestration, status, compliance and memory |
| **Engines** | 9 engines: routing, risk, quality, evaluation, health, planning, agent-executor, agent-loop, crud-governance |
| **Role Profiles** | 13 role definitions (prompt + task blueprint) with a 3-tier hierarchy (Supreme / Core / Recon) — not 13 independent LLM agents |
| **Runtime** | Headless CLI adapters, DAG dispatcher, git-worktree isolation, signed evidence bundles |
| **Memory** | 3-layer memory: vector (TF-IDF/OpenAI), project, specialty |
| **Skills** | 15 core skills in `skills/<slug>/SKILL.md` format, mapped across 7 platform adapters |
| **Providers** | 7 platform adapters: Claude (default), Cursor, Codex, Antigravity, Grok, Local LLM, OpenCode |
| **Contracts** | Zod-schema task contracts and API contracts |
| **Standards** | 36 governance standard templates |

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

## 🎯 13 Role Profiles (Reference)

> These are **role definitions injected into your single host assistant**, not 13 parallel
> LLM processes. Your host AI takes on each profile sequentially.

| Profile | Tier | Capability | Role |
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

## 3-Layer Memory System

| Layer | Storage | Technology | Purpose |
|-------|---------|------------|---------|
| **Vector Memory** | SQLite | Local TF-IDF embeddings (cosine similarity); optional OpenAI `text-embedding-3-small` when `OPENAI_API_KEY` is set | Semantic search across project knowledge |
| **Project Memory** | Markdown | `PROJECT_MEMORY.md` | Central project state, synchronized every session |
| **Specialty Memory** | Markdown | `.atabey/memory/specialties/{agent}.md` | Per-agent learned conventions from past tasks |

> **Local by default, not unconditionally local:** if you configure `OPENAI_API_KEY`,
> embedding requests send the embedded text to the OpenAI API. Without a key, Atabey stays
> on-machine and falls back to the local TF-IDF vectorizer (384-dim).


---

## 🎯 15 Core Skills (Reference)

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

## 📚 Knowledge Base (36 Standards)

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

## 7 Platform Adapters

| Platform | Framework Dir | Agents Dir | Shim File | Native MCP Config |
|----------|---------------|------------|-----------|-------------------|
| **Claude Code** ⭐ (default) | `.claude` | `.claude/agents/*.md` | `CLAUDE.md` | `.mcp.json` |
| **Cursor IDE** | `.cursor` | `.cursor/rules/*.mdc` | `CURSOR.md` | `.cursor/mcp.json` |
| **Codex CLI / Copilot** | `.agents` | `.agents/instructions/*.md` | `copilot-instructions.md` | `.mcp.json` |
| **Antigravity CLI** | `.agents` | `.agents/agents/{name}/agent.json` | `AGENTS.md` | `.agents/mcp_config.json` |
| **Grok** | `.grok` | `.grok/agents/*.md` | `GROK.md` | `.grok/mcp_config.json` |
| **Local LLM / Ollama** | `.atabey` | `.atabey/agents/*.md` | `LOCAL_AI.md` | `.atabey/mcp_config.json` |
| **OpenCode** | `.opencode` | `.opencode/agents/*.md` | `OPENCODE.md` | `opencode.json` |

> `atabey init all` compiles and mirrors agent profiles across **all platforms simultaneously**
> (one canonical setup — all 13 role profiles, every time). Each platform gets **exactly one**
> native MCP config; generated entries use the portable `npx -y atabey-mcp` launcher.
>
> Skills are scaffolded in the discoverable `skills/<slug>/SKILL.md` directory format with YAML frontmatter.
> Gemini CLI is **no longer supported** — `atabey init gemini` warns and falls back to Claude.
>
> **Enforcement is platform-dependent.** Platforms that route their tools through Atabey MCP get
> the full pipeline. Platforms that keep native shell/edit tools need their allow-lists or hooks
> configured to disable those tools; otherwise the host can act outside Atabey. See
> [Known Limitations](https://github.com/ysf-bkr/atabey/blob/main/docs/limitations.md).


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
│   │   ├── agents/      # 13 role profile definitions + registry
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

## What Atabey Does

| Outcome | How it is delivered |
|---------|---------------------|
| **Govern** | Deny-by-default permission matrix and protected paths for tool calls that go through Atabey MCP |
| **Gate** | Risk scoring plus human-in-the-loop approval for operations above the configured threshold |
| **Verify** | AST/lint/contract checks, test execution and evidence bundles before a task is reported as done |
| **Record** | Keyed HMAC audit chain that makes tampering detectable |
| **Bound** | Loop detection, per-provider token ceilings and execution timeouts |

Under the hood: 40 MCP tools, 13 role profiles, 15 core skills and 36 standard templates.
These are implementation inventory, not the product promise. The reference sections below
list them; the product promise is the governed, verified workflow they support.


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

## 📦 Dependencies

- **atabey-shared**: Shared constants, storage, PII masking, audit and locking primitives
- **atabey-mcp** _(optional)_: MCP server enabling `atabey mcp start` and the HTTP/SSE transport
- **better-sqlite3**: SQLite database for memory, audit and tasks
- **zod**: Runtime schema validation
- **chalk**: Terminal UI styling
- **js-yaml**: YAML parsing for the agent-registry validator
- **typescript**: TypeScript Compiler API for AST compliance scanning

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
