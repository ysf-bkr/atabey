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

> `atabey init all` compiles and mirrors agents across **all platforms simultaneously** (one canonical setup — all 13 specialists, every time). Each platform gets **exactly one** native MCP config; generated entries use the portable `npx -y atabey-mcp` launcher.
>
> Skills are scaffolded in the discoverable `skills/<slug>/SKILL.md` directory format with YAML frontmatter.
> Gemini CLI is **no longer supported** — `atabey init gemini` warns and falls back to Claude.
