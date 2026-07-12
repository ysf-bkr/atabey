# Atabey — Experimental MCP-based Multi-Agent Orchestration Tool

> **Language / Dil:** [English](#atabey--experimental-mcp-based-multi-agent-orchestration-tool) · [Türkçe](#türkçe)

*Pre-alpha · v0.0.25 · Single-developer project*

Atabey is an **experimental MCP (Model Context Protocol) server** that adds a multi-agent orchestration layer on top of AI coding assistants (Claude Code, Gemini CLI, Cursor, etc.). It provides agent routing, governance middleware, risk gating, and memory persistence — all running locally via MCP.

> [!CAUTION]
> **This is pre-alpha software (v0.0.x).** It is an open-source experiment by a single developer. Core features work (TF-IDF routing, regex PII masking, deterministic rules) but it is **not production-ready**. See [BLINDSPOTS.md](./BLINDSPOTS.md) for known limitations.

---

## How It Works

Atabey connects to your AI interface as an MCP tool server. Once connected, you use `@agent` commands in your AI chat:

```
You (@backend): "Create a user login service with JWT authentication"
     │
     ▼
  Atabey MCP Server
     │  Intercepts @agent command
     │  Routes to @backend agent definition
     │  Governance middleware chain validates
     │  Quality gate checks output
     │  Stores in vector memory
     │
     ▼
  Returns governed, reviewed result
```

**No separate terminal needed for daily use.** Just chat with your AI and use `@agent` syntax.

### What Atabey Is

- A deterministic, rule-based governance and orchestration middleware for AI coding assistants
- An MCP server that provides 39 tools across file system, search, messaging, memory, and orchestration
- A local-first tool (everything runs on your machine, no cloud dependency)

### What Atabey Is Not

- A standalone LLM runtime (unlike LangGraph/CrewAI)
- An AI/ML-driven threat analysis platform
- A production-ready enterprise product

---

## Quick Start

```bash
# Install globally
npm install -g atabey

# Initialize in your project
npx atabey init gemini --profile freelancer --yes

# Verify
npx atabey status

# Optional: web dashboard
npx atabey dashboard
```

### MCP Connection

Add to your AI client's `mcp.json`:

```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["atabey-mcp"]
    }
  }
}
```

Then use in AI chat: `@backend "Create login API"`, `@security "Audit the auth module"`, etc.

---

## Core Features

| Feature | Description |
|---------|-------------|
| **Agent Routing** | Routes `@agent` commands to 13 agent prompt definitions via TF-IDF + cosine similarity |
| **Governance Middleware** | Pre/post execution checks: PII masking, risk scoring, loop detection, FinOps, license scan, auto-rollback |
| **Risk Engine** | Keyword + path + behavioral risk assessment (score ≥ 60 requires human approval) |
| **Quality Gate** | Compliance scan, lint validation, content checks |
| **Vector Memory** | SQLite-backed TF-IDF/OpenAI embedding storage with cosine similarity search |
| **Project Memory** | Markdown-based project state tracking |
| **Dashboard** | Real-time WebSocket UI for agents, messages, approvals, logs |
| **PII Masking** | 20+ regex patterns (email, phone, TC ID, credit card, IBAN, etc.) |
| **Loop Detection** | Blocks infinite tool call loops with cooldown mechanism |
| **FinOps** | Per-agent token/cost tracking with monthly budgets |
| **Auto-Rollback** | Pre-write snapshots with post-write governance validation |

### 13 Agent Definitions

| Agent | Tier | Role |
|-------|------|------|
| `@manager` | Supreme | Orchestration, approvals |
| `@security` | Supreme | Security audit |
| `@architect` | Core | System design, contracts |
| `@backend` | Core | API, business logic |
| `@frontend` | Core | UI, components |
| `@quality` | Core | Compliance, lint, coverage |
| `@database` | Core | Database management |
| `@analyst` | Core | Strategy analysis |
| `@mobile` | Core | React Native |
| `@native` | Core | Native integration |
| `@devops` | Core | CI/CD, deploy |
| `@explorer` | Recon | Codebase discovery |
| `@git` | Recon | Version control |

### Governance Middleware Chain

Every MCP tool call passes through:

```
Validation → Rules Engine → Discipline → Loop Detection → FinOps
→ License Scan → Auto-Rollback Snapshot → Risk Gate / Human-in-Loop
→ PII Masking → EXECUTION → Post-Validation → Injection Protection
→ PII Masking → Audit Log
```

---

## CLI Reference

```bash
atabey init [adapter]          Initialize project (--profile freelancer|team|enterprise)
atabey mcp start|install       MCP server management
atabey dashboard [port]        Web dashboard (default: 5858)
atabey orchestrate             Start orchestration loop
atabey check                   System health check
atabey status                  Agent status + costs
atabey plan [submit <json>]    Task planning
atabey approve <traceId>       Approve blocked task
atabey trace new|replay <id>   Execution traces
atabey memory update           Project memory
atabey git commit|sync         Git operations
atabey explorer graph|audit    Code analysis
atabey security <path>         Security audit
atabey compliance <path>       Compliance check
atabey contract                Verify contract integrity
atabey knowledge <query>       Knowledge base search
atabey lint                    Run ESLint
atabey log <agent>             View agent logs
atabey script <name>           Run predefined script
atabey index [dir]             Index codebase for RAG
atabey coverage                Test coverage reports
atabey quickstart              Generate example task file
```

---

## Project Status

| Aspect | Status |
|--------|--------|
| **Version** | v0.0.25 (pre-alpha) |
| **Development** | Single developer, open-source experiment |
| **Build** | ✅ 4/4 packages compile |
| **Tests** | ✅ 453 tests passing (67 files) |
| **Production Readiness** | ❌ Not ready — see [BLINDSPOTS.md](./BLINDSPOTS.md) |
| **Security Sandbox** | ⚠️ Off by default — enable via `ATABEY_SANDBOX_UID` |

### Known Limitations

- Shell sandboxing is off by default (opt-in via environment variables)
- Token estimation is approximate (text length / 4), not actual tokenizer billing
- Vector memory uses TF-IDF fallback when OpenAI API is unavailable
- No CI/CD pipeline for automated badge updates yet
- Single-developer maintenance — response times may vary

---

## Architecture

```
packages/
├── atabey/          CLI, agent definitions, engines, memory, providers
├── atabey-mcp/      MCP server, governance middleware, dashboard API
└── shared/          Shared utilities: PII, audit, storage, logger, types
```

---

## Security & Privacy

- PII masking (20+ patterns) applied before any data is logged or sent to LLMs
- Audit trail with hash-chain integrity verification
- Data retention policies (30/90 day auto-prune)
- Right to erasure (KVKK Art. 7 / GDPR Art. 17)
- See [SECURITY.md](./SECURITY.md) and [PRIVACY.md](./PRIVACY.md)

---

## License

AGPL-3.0 — Yusuf BEKAR

*Developer: **Yusuf BEKAR** — "Order from Chaos"*

---

## Türkçe

**Atabey**, MCP (Model Context Protocol) üzerine inşa edilmiş deneysel bir çoklu-ajan orkestrasyon aracıdır. Mevcut AI asistanlarınıza (Claude Code, Gemini CLI, Cursor vb.) bir yönetişim katmanı ekler.

Kurulum:

```bash
npm install -g atabey
npx atabey init gemini --profile freelancer --yes
```

Daha fazla bilgi için [README.md'nin İngilizce bölümünü](#atabey--experimental-mcp-based-multi-agent-orchestration-tool) okuyabilirsiniz.
