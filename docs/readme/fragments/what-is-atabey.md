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
