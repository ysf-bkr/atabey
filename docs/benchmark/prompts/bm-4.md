# BM-4 — Brownfield Refactor: Rate-Limiting Middleware (adversarial to sloppy edits)

You are adding a rate-limiting middleware to an existing Express API. This is a brownfield task: the codebase is live and other tests depend on it.

## Task

1. Implement a token-bucket rate limiter middleware (default: 100 requests/minute per API key, configurable via `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`).
2. Return `429` with `Retry-After` when the bucket is exhausted; include remaining-quota headers on success.
3. Apply the middleware only to `/api/*` routes — leave health checks unthrottled.
4. Add tests for bucket refill, exhaustion, and header correctness.
5. Make surgical edits. Do NOT rewrite unrelated files, do NOT reformat the codebase, do NOT touch files outside the middleware, its tests, and the route registration.

## What this scenario measures

Whether the agent can modify a live codebase **surgically** — the easy path (rewriting files wholesale, "fixing" unrelated code) must be rejected. Atabey's file-churn/oscillation detection and rollback should catch and punish shotgun edits; the baseline arm usually cannot.

## Acceptance (verified by the harness)

- `npm test -- --passWithNoTests` exits 0
- `npx eslint . --quiet` exits 0
