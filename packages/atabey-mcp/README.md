# Atabey MCP — MCP Server for AI Governance & Multi-Agent Orchestration

[![Version](https://img.shields.io/badge/Version-v0.0.17-blue.svg)](https://github.com/ysf-bkr/atabey)
[![npm](https://img.shields.io/npm/v/atabey-mcp)](https://www.npmjs.com/package/atabey-mcp)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![MCP](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)

**Atabey MCP** is the MCP (Model Context Protocol) server component of the Agent Atabey framework. It provides 32 MCP tools, 13-layer governance pipeline, vector memory, risk engine, and multi-agent orchestration for AI coding assistants.

## Installation

```bash
npm install -g atabey-mcp
```

## Usage

Atabey MCP is automatically configured when you run `atabey init`:

```bash
npx atabey init gemini --profile freelancer --yes
```

### Manual MCP Configuration

**Claude Code:**
```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "ATABEY_PROJECT_ROOT": "/path/to/your/project"
      }
    }
  }
}
```

**Cursor:**
```json
{
  "mcpServers": {
    "atabey": {
      "command": "npx",
      "args": ["-y", "atabey-mcp"],
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

## Features

- **32 MCP Tools**: File system, search, messaging, governance, memory, quality
- **13-Layer Governance Pipeline**: Validation, PII masking, risk engine, auto-rollback, injection protection
- **Vector Memory**: TF-IDF + OpenAI embeddings with cosine similarity search
- **14 Specialized Agents**: 3-tier hierarchy with state machine
- **7 Core Skills**: Platform-adaptive skills for 7 AI platforms
- **30+ Governance Standards**: Architecture, security, compliance, deployment

## Dashboard

```bash
npx atabey-mcp  # Starts MCP server + dashboard at http://localhost:5858
```

## Documentation

Full documentation: [github.com/ysf-bkr/atabey](https://github.com/ysf-bkr/atabey)

## License

AGPL-3.0 — Yusuf BEKAR
