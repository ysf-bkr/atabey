# Authentication (Phase 2.1)

## Modes

| Mode | When | Behavior |
|------|------|----------|
| **Open** | No tokens + auth not required | Anonymous access (local freelancers) |
| **Optional auth** | Tokens set, `required=false` | Token accepted; unauthenticated still allowed only for public paths; API routes with credentials enforced when token store exists |
| **Required (strict)** | `MCP_AUTH_REQUIRED=true` or `auth.required` in config | Fail closed: no valid Bearer → 401 |

## Configuration

### Environment

```bash
export MCP_AUTH_REQUIRED=true
export MCP_AUTH_TOKEN="replace-with-long-random-secret"
# or multi-user:
export MCP_AUTH_USERS="alice:key1,bob:key2"
```

### `.atabey/config.json`

```json
{
  "auth": { "required": true }
}
```

Env overrides config.

## HTTP

```http
GET /mcp/sse
Authorization: Bearer <token>
```

Public without token:
- `GET /mcp/health`

Protected when auth enabled/required:
- `/mcp/sse`, `/mcp/messages`

## Stdio MCP (IDE)

Local stdio transports typically do not send HTTP headers. Identity comes from `MCP_USER` / git user. Prefer `MCP_TRANSPORT=stdio` on localhost; use unified HTTP only with `MCP_AUTH_REQUIRED=true` and a strong token.
