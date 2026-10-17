# Self-Host Deployment (Faz D.2)

One-command, dependency-light self-hosting for the Atabey control plane.

## Quick start (Docker Compose)

```bash
# 1. Set an auth token (required when exposed beyond localhost)
export MCP_AUTH_TOKEN="$(openssl rand -hex 32)"

# 2. Build & start
docker compose up -d --build

# 3. Dashboard + unified MCP + Hermes WSS Bus
open http://localhost:5858            # Dashboard
# MCP over HTTP/SSE:  http://localhost:5858/mcp/sse
# Hermes WSS Bus:     ws://localhost:5858/bus
```

## What runs

| Endpoint | Purpose |
|---|---|
| `5888/mcp/sse` | Unified MCP (HTTP/SSE) for remote agents |
| `/bus` | **Hermes WSS Bus** — distributed locks + inter-agent routing |
| `/ws` | Dashboard live feed (WebSocket) |
| `/api/*` | Control-plane REST API |

## Security (production)

Atabey is **fail-closed**: bind plaintext to a non-loopback host only with an
auth token and, ideally, TLS.

```bash
# TLS 1.3 (+ optional mTLS) — mount certs and set:
ATABEY_TLS_CERT_FILE=/certs/server.crt
ATABEY_TLS_KEY_FILE=/certs/server.key
ATABEY_TLS_REQUIRED=true
ATABEY_MTLS_REQUIRED=true
ATABEY_TLS_CA_FILE=/certs/client-ca.crt

# Auth (required for network exposure)
MCP_AUTH_REQUIRED=true
MCP_AUTH_TOKEN=<token>

# Sandbox every agent turn (recommended outside local dev)
ATABEY_SANDBOX_REQUIRED=true
ATABEY_SANDBOX_RUNTIME=container
```

## Environment reference

| Variable | Default | Meaning |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `unified` for HTTP/SSE + dashboard + bus |
| `MCP_HOST` / `MCP_PORT` | `127.0.0.1` / `5858` | Bind address |
| `ATABEY_PROJECT_ROOT` | cwd | Project the control plane governs |
| `ATABEY_AGENT_RUNTIME` | off | `true` → agents really execute via headless CLI |
| `ATABEY_AGENT_CONTEXT` | off | `true` → inject CodeGraph context bundles |
| `ATABEY_BUS_TOKEN` | — | Shared secret for the Hermes WSS Bus |
| `MCP_AUTH_TOKEN` | — | Bearer token for HTTP/SSE + WebSocket |

## Without Docker

```bash
npm install
npm run build
MCP_TRANSPORT=unified MCP_PORT=5858 node packages/atabey-mcp/dist/atabey-mcp/src/mcp/index.js
```

> **Note:** `better-sqlite3` is a native addon. On minimal hosts install a C++
> toolchain (`python3 make g++`) or use the prebuilt binaries.
