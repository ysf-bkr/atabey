# BM-2 — CRUD API (Go)

You are implementing a REST resource in an existing Go module.

## Task

1. Implement CRUD endpoints (`GET /items`, `GET /items/{id}`, `POST /items`, `PUT /items/{id}`, `DELETE /items/{id}`) using the project's existing router (default to `net/http` if none).
2. Add pagination (`?page=&pageSize=`, defaults 1/20, max 100) and sorting (`?sort=field`).
3. Validate request bodies server-side; return RFC-7807-style error responses with correct status codes (400/404/422).
4. Use parameterized queries only — raw SQL string concatenation is forbidden.
5. Write table-driven tests covering happy paths, validation failures, and pagination edge cases.

## Constraints

- Idiomatic Go; no global mutable state.
- All errors wrapped with context (`fmt.Errorf("...: %w", err)`).

## Acceptance (verified by the harness)

- `go test ./...` exits 0
