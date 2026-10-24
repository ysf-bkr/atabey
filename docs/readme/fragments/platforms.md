## Platform Adapters

Atabey writes a native MCP config for 8 adapters. "Verified" means the file location and
schema match the vendor's published documentation (covered by tests) — **not** that the
client connected. See [AI Tool Support](https://github.com/ysf-bkr/atabey/blob/main/docs/ai-tool-support.md).

| Tool | Adapter | Config written | Status |
|------|---------|----------------|--------|
| Claude Code | `claude` | `.mcp.json` (`mcpServers`) + `.claude/settings.json` hook | Verified |
| Cursor | `cursor` | `.cursor/mcp.json` (`mcpServers`) | Verified |
| OpenAI Codex CLI | `codex` | `.codex/config.toml` (`[mcp_servers.atabey]`) | Verified |
| GitHub Copilot / VS Code | `copilot` | `.vscode/mcp.json` (`servers`) | Verified |
| OpenCode | `opencode` | `opencode.json` (`mcp.atabey`) | Verified |
| Grok CLI | `grok` | `.grok/mcp_config.json` | Experimental |
| Antigravity CLI | `antigravity-cli` | `.agents/mcp_config.json` | Experimental |
| Local models | `local` | `.atabey/mcp_config.json` | Experimental — needs an MCP host |

> `atabey init all` compiles agent profiles into every platform's native layout. Each
> platform gets exactly one native MCP config; generated entries use the portable
> `npx -y atabey-mcp` launcher.
>
> Skills are scaffolded in the discoverable `skills/<slug>/SKILL.md` directory format with YAML frontmatter.
> Gemini CLI is **no longer supported** — `atabey init gemini` warns and falls back to Claude.
>
> **Enforcement is platform-dependent.** Platforms that route their tools through Atabey MCP get
> the full pipeline. Platforms that keep native shell/edit tools need their allow-lists or hooks
> configured to disable those tools; otherwise the host can act outside Atabey. Only Claude Code
> gets a generated `PreToolUse` hook. See
> [Known Limitations](https://github.com/ysf-bkr/atabey/blob/main/docs/limitations.md).
