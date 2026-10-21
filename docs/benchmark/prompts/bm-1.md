# BM-1 — JWT Login Service (Node/TypeScript)

You are implementing a production-grade login service in an existing Node.js + TypeScript project.

## Task

1. Implement `POST /auth/login` and `POST /auth/refresh` endpoints (Fastify or Express — match the existing project setup).
2. Issue short-lived JWT access tokens (15 min) and rotating refresh tokens (7 days, single-use with reuse detection).
3. Add an auth middleware that validates the access token and attaches the verified payload to the request.
4. Hash passwords with argon2 (or bcrypt if argon2 is unavailable). Never store or log plaintext passwords.
5. Write unit tests for: token issuance, refresh rotation, reuse detection, and middleware rejection of invalid/expired tokens.

## Constraints

- No `any` types. Strict TypeScript.
- Secrets must come from environment variables (`JWT_SECRET`, `REFRESH_SECRET`).
- Do not add new runtime dependencies beyond `jsonwebtoken` (or `jose`) and the password hasher.

## Acceptance (verified by the harness, not by your claim)

- `npm test -- --passWithNoTests` exits 0
- `npx tsc --noEmit` exits 0
