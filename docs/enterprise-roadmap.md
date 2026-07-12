# Enterprise Roadmap — Step Tracking

Living checklist for moving Atabey from local governance middleware toward an enterprise security & scale platform.

## Maturity badges

| Badge | Meaning | Status |
|-------|---------|--------|
| Local Core | MCP + heuristic governance | **Current** |
| Secure Edge | Sandbox + hard policy gate | In progress (P0→P1) |
| Org Control | OIDC + central policy | Planned P2 |
| Scale Platform | Runners + multi-repo | Planned P3 |
| Compliance Ready | Evidence packs + pen-test | Planned P4 |

## Phase 0 — Foundation freeze

| Step | Item | Status |
|------|------|--------|
| 0.1 | Threat model (STRIDE) | **Done** — `docs/threat-model.md` |
| 0.2 | Universal `PolicyGate.evaluate` for mutating tools | **Done** — shared + governance middleware |
| 0.3 | `withLock` on all write tools | **Done** — write/replace/patch/batch |
| 0.4 | Security state persistence (loop/cooldown) | **Done** — SQLite + security-state façade + restart tests |
| 0.5 | Adversarial / lock tests | **Done** — policy-gate + file-lock tests |

### Phase 0 complete checklist
- [x] 0.1 Threat model
- [x] 0.2 PolicyGate on mutating tools
- [x] 0.3 withLock on write tools
- [x] 0.4 Durable security cooldowns
- [x] 0.5 Tests

**Next:** Phase 1.1 — Container/Podman sandbox runtime prototype

## Phase 1 — Security boundary

| Step | Item | Status |
|------|------|--------|
| 1.1 | Sandbox runtime (`none`/`uid`/`container`/`auto`) | **Done** — `sandbox-runtime.ts` + shell wired |
| 1.2 | File writes mediated via sandbox-fs (container stdin / host) | **Done** — write/replace/patch/batch |
| 1.3 | Enterprise profile forces `sandbox.required` | **Done** — config + bootstrap apply |
| 1.4 | Audit hash chain (logs + structured audit) | **Done** — chain helpers, verify API, boot check |
| 1.5 | Network deny + resource limits (container) | **Done** for shell + container writes |

### Phase 1 complete (1.1–1.4)

### Phase 1.1 usage

```bash
export ATABEY_SANDBOX_RUNTIME=container   # or auto
export ATABEY_SANDBOX_REQUIRED=true
export ATABEY_SANDBOX_IMAGE=node:20-bookworm-slim
```

## Phase 2 — Control plane

| Step | Item | Status |
|------|------|--------|
| 2.1 | HTTP auth required + enterprise profile + timing-safe tokens | **Done** |
| 2.2 | Full OIDC/JWT (JWKS) validation | **Next** |
| 2.3 | Multi-tenant org/workspace registry | Pending |
| 2.4 | Central policy push to edge | Pending |

### Phase 2.1 usage

```bash
export MCP_AUTH_REQUIRED=true
export MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
# Authorization: Bearer $MCP_AUTH_TOKEN
```

See `docs/auth.md`.

---

**How we work:** one step at a time; each step ships code + tests + this checklist update.
