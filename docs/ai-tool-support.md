# AI Tool Support — what is verified, and what is not

**Version:** v0.1.7
**Last verified:** 2026-10-24

Atabey connects to AI coding tools over MCP. This page separates three different
claims that are easy to confuse:

| Claim | Meaning | How it is checked |
|---|---|---|
| **Config written** | `atabey init` wrote a file in the expected location | Automated tests (`adapter_init.test.ts`) |
| **Config verified** | The location and schema match the vendor's published documentation | Test assertions derived from the vendor doc (linked per adapter) |
| **Client connected** | The real application started Atabey, listed its tools and called one | **Manual only** — see the checklist below |

**No adapter is in the third category yet.** The test suite proves the first two.
A green test run does not prove that Claude Code, Cursor, Codex, VS Code or
OpenCode actually loaded the server on your machine.

---

## Support matrix

| Tool | Adapter | Config Atabey writes | Scope | Activated by | Level |
|---|---|---|---|---|---|
| **Claude Code** | `claude` | `.mcp.json` (`mcpServers`) + `.claude/settings.json` hook | Project | Claude Code CLI | **Verified** ([docs](https://code.claude.com/docs/en/hooks)) |
| **Cursor** | `cursor` | `.cursor/mcp.json` (`mcpServers`) | Project | Cursor IDE | **Verified** ([docs](https://cursor.com/docs/context/mcp)) |
| **OpenAI Codex CLI** | `codex` | `.codex/config.toml` → `[mcp_servers.atabey]` | Project (trusted projects only) | Codex CLI / IDE extension | **Verified** ([docs](https://developers.openai.com/codex/mcp)) |
| **GitHub Copilot (VS Code)** | `copilot` | `.vscode/mcp.json` (`servers`) | Project | VS Code with the Copilot/agent stack | **Verified** ([docs](https://code.visualstudio.com/docs/agent-customization/mcp-servers)) |
| **OpenCode** | `opencode` | `opencode.json` (`mcp.atabey`) | Project | OpenCode | **Verified** ([config schema](https://opencode.ai/config.json)) |
| **Grok CLI** | `grok` | `.grok/mcp_config.json` | Project | Not established | **Experimental** |
| **Antigravity CLI** | `antigravity-cli` | `.agents/mcp_config.json` | Project | Not established | **Experimental** |
| **Local models (Ollama / vLLM / LM Studio)** | `local` | `.atabey/mcp_config.json` | Project | Nothing — see below | **Experimental** |

### Notes that matter

- **Codex ≠ Copilot.** They use different files and different formats. Codex reads TOML
  `[mcp_servers.*]` tables; VS Code reads JSON with a top-level `servers` object. Atabey
  previously aliased `copilot` to `codex` and wrote a root `.mcp.json` for both, which
  Codex never reads.
- **`.mcp.json` vs `.vscode/mcp.json` are not interchangeable.** Portable files use
  `mcpServers`; VS Code's format uses `servers`. VS Code only reads a workspace-root
  `.mcp.json` when the experimental `chat.mcp.workspaceRootConfig.enabled` setting is on,
  so Atabey writes `.vscode/mcp.json` instead.
- **Codex project scope requires a trusted project.** Otherwise Codex only reads
  `~/.codex/config.toml`. Atabey writes the project file; global Codex config is not
  touched.
- **A model server is not an MCP host.** Ollama, vLLM and LM Studio serve models. Nothing
  in them reads `.atabey/mcp_config.json`. The `local` adapter writes the file for a host
  you bring yourself (for example an editor that reads Atabey's config, or a custom MCP
  client). Do not read the file's existence as support.
- **Enforcement scope.** Even when connected, Atabey's controls apply to calls that go
  through Atabey MCP tools. A host's own shell/edit tools can act outside them. On Claude
  Code, `atabey init` also writes a `PreToolUse` hook to deny `Edit`/`Write`/`NotebookEdit`
  and shell writes; on other tools there is no equivalent hook, so out-of-band edits are
  only detected after the fact.

---

## Config schemas Atabey writes

**Claude Code** — `.mcp.json` (portable) and `.claude/settings.json`:

```json
{
  "mcpServers": {
    "atabey": { "command": "npx", "args": ["-y", "atabey-mcp"], "env": { "...": "..." } }
  }
}
```

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|NotebookEdit|MultiEdit|Bash|PowerShell",
        "hooks": [{ "type": "command", "command": "node \".claude/hooks/pre-tool-use.cjs\"" }]
      }
    ]
  }
}
```

The hook answers a blocked call with the documented JSON decision on exit 0:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "…"
  }
}
```

Exit code 1 is a **non-blocking** error in Claude Code, so a hook that merely prints to
stderr and exits 1 does not stop the tool call. Atabey previously did exactly that.

**Codex** — `.codex/config.toml`:

```toml
[mcp_servers.atabey]
command = "npx"
args = ["-y", "atabey-mcp"]

[mcp_servers.atabey.env]
ATABEY_PROJECT_ROOT = "/path/to/project"
MCP_TRANSPORT = "stdio"
```

**VS Code / Copilot** — `.vscode/mcp.json`:

```json
{
  "servers": {
    "atabey": { "type": "stdio", "command": "npx", "args": ["-y", "atabey-mcp"] }
  }
}
```

**Cursor** — `.cursor/mcp.json`: portable `mcpServers` shape, same entry as Claude.

**OpenCode** — `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "atabey": { "type": "local", "command": ["npx", "-y", "atabey-mcp"], "enabled": true }
  }
}
```

Re-running `atabey init` replaces Atabey's own entry, keeps other servers and unrelated
keys, and does not duplicate entries. That is covered by tests.

---

## Manual verification checklist

Run this per tool, on each OS you support. It is the only way to claim "connected".

1. **Generate** in a throwaway project: `npx atabey init <adapter> --yes`.
2. **Inspect** the file listed in the matrix: correct path, correct key
   (`mcpServers` / `servers` / TOML table / `mcp`).
3. **Restart** the client completely (not just reload the window).
4. **Find the server** in the client's MCP server list. It must be listed and not errored.
5. **Call one harmless tool**, e.g. *"Use the Atabey MCP server to list the files in the
   project root and report the result. Do not change anything."*
6. **Confirm the call actually happened**: the client shows a tool call to the `atabey`
   server and the answer reflects its output. A plausible answer alone is not evidence.
7. **Check stdio purity**: no log lines on stdout. Diagnostics must go to stderr; otherwise
   the JSON-RPC stream is corrupted. (`stdio-purity.test.ts` covers the compiled server.)
8. **Claude Code only** — verify the hook:
   - a normal read-only `Bash` call (`npm test`) is **not** blocked;
   - `Write` is **denied** and the denial message mentions the Atabey MCP tools;
   - `mcp__atabey__write_file` is **not** blocked;
   - your own hooks in `.claude/settings.json` still run after `atabey init`.

Record the tool version and OS in your notes. Until then, treat the adapter as
"config verified, connection unverified".

---

## What would move an adapter to "fully supported"

1. The config schema check above, automated (already done for all adapters).
2. A recorded manual run on the claimed OS with the client version noted.
3. A screenshot or log excerpt showing the Atabey tool call and its output.
4. The same steps repeated after a client upgrade, so the claim does not rot.

Adapters that cannot meet 1–3 stay **experimental** and say so in `atabey init` output.
