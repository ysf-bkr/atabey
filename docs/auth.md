# Authentication (Phase 2.1)

## Modes

| Mode | When | Behavior |
|------|------|----------|
| **Open** | No tokens + auth not required | Anonymous access (local freelancers) |
| **Optional auth** | Tokens set, `required=false` | Token accepted; unauthenticated still allowed only for public paths; API routes with credentials enforced when token store exists |
| **Required (enterprise)** | `MCP_AUTH_REQUIRED=true` or `auth.required` in config | Fail closed: no valid Bearer → 401 |

## Configuration

### Environment

```bash
export MCP_AUTH_REQUIRED=true
export MCP_AUTH_TOKEN="replace-with-long-random-secret"
# or multi-user:
export MCP_AUTH_USERS="alice:key1,bob:key2"
```

### `.atabey/config.json` (set by `atabey init --profile enterprise`)

```json
{
  "auth": { "required": true }
}
```

Env overrides config.

## HTTP

```http
GET /api/agents
Authorization: Bearer <token>
```

Public without token:
- `GET /api/health`
- `GET /mcp/health`
- Static dashboard assets

Protected when auth enabled/required:
- All other `/api/*`
- `/mcp/sse`, `/mcp/messages`

Status (requires auth when enabled):
- `GET /api/auth/status`

## OIDC (prep for Phase 2.2)

```bash
export ATABEY_OIDC_ISSUER=https://login.example.com/
export ATABEY_OIDC_AUDIENCE=atabey-api
export ATABEY_OIDC_JWKS_URL=https://login.example.com/.well-known/jwks.json
```

JWT validation is **not enforced yet** — env is detected and logged. Full OIDC lands in Phase 2.2.

## Stdio MCP (IDE)

Local stdio transports typically do not send HTTP headers. Identity comes from `MCP_USER` / git user. Prefer `MCP_TRANSPORT=stdio` on localhost; use unified HTTP only with `MCP_AUTH_REQUIRED=true` and a strong token.
