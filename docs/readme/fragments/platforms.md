## 8 Platform Adapters

| Platform | Framework Dir | Agents Dir | Shim File |
|----------|---------------|------------|-----------|
| **Claude Code** | `.claude` | `.claude/agents/*.md` | `CLAUDE.md` |
| **Gemini CLI** | `.gemini` | `.gemini/agents/*.md` | `GEMINI.md` |
| **Cursor IDE** | `.cursor` | `.cursor/rules/*.mdc` | `CURSOR.md` |
| **Codex CLI / Copilot** | `.agents` | `.agents/instructions/*.md` | `copilot-instructions.md` |
| **Antigravity CLI** | `.agents` | `.agents/agents/{name}/agent.json` | `AGENTS.md` |
| **Grok** | `.grok` | `.grok/agents/*.md` | `GROK.md` |
| **Local LLM / Ollama** | `.atabey` | `.atabey/agents/*.md` | `LOCAL_AI.md` |
| **OpenCode** | `.opencode` | `.opencode/agents/*.md` | `OPENCODE.md` |

> `atabey init <platform> --unified` configures and mirrors agents across **all platforms simultaneously**.
