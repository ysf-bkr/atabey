# [NATIVE] Corporate Native / Platform-Layer Standards (Rust / Go)

This document defines the mandatory language, safety, and FFI rules for the
native / platform tier of any project governed by Agent Atabey.

> **Supreme rule:** The native/platform layer is written in **Rust (preferred)**
> or **Go**. TypeScript/JavaScript is FORBIDDEN for this tier. Business logic
> lives in the application tier (TypeScript); the native tier owns system calls,
> FFI bridges, and performance-critical hot paths.

## 1. Language Mandate
- **Rust (preferred):** Default choice for memory safety, zero-cost abstractions,
  and safe concurrency. Use the latest stable toolchain (`rustup`).
- **Go (alternative):** Acceptable for simple OS glue, CLIs, and highly
  concurrent services where GC overhead is acceptable.
- **Forbidden:** TypeScript/JavaScript native addons (e.g. `node-gyp` C++ addons),
  or any attempt to implement platform-layer logic in the application tier.

## 2. Memory Safety
- **Rust:** Minimize `unsafe`. Any `unsafe` block must be justified with a
  `// SAFETY:` comment explaining why the invariant holds. Isolate `unsafe` in
  dedicated FFI-boundary modules reviewed by `@security`.
- **Go:** Avoid `unsafe` and `reflect`-based hacks. Prefer strong typing and
  explicit error handling over panics in library code.
- **No data races:** Rust — use the type system (`Send`/`Sync`) and avoid
  `static mut`. Go — guard shared state with channels or `sync` primitives.

## 3. FFI Boundary (Rust/Go <-> TypeScript)
- **Isolate:** Every language boundary lives in a single, dedicated module
  (e.g. `src/ffi/` or `src/bridge/`). Never scatter FFI calls across the codebase.
- **Versioned ABI:** Define a strict, documented, versioned ABI contract.
  Breaking changes require a new ABI version and `@architect` approval.
- **Validation:** Validate ALL data crossing the boundary (length, type, range).
  Treat every FFI input as untrusted. Never pass raw pointers without bounds checks.
- **Panic safety (Rust):** Catch panics at the FFI boundary (`catch_unwind`) so a
  Rust panic never unwinds into the TypeScript runtime.
- **Error mapping:** Map native errors to typed application-tier errors. Never
  leak raw OS error codes or stack traces to the caller.

## 4. Build & Toolchain
- **Rust:** `cargo build`, `cargo test`, `cargo clippy` (zero warnings required),
  `cargo fmt` enforced. Pin the toolchain via `rust-toolchain.toml`.
- **Go:** `go build ./...`, `go test ./...`, `go vet ./...`, `gofmt`/`goimports`
  enforced. Pin the module via `go.mod`.
- **Reproducibility:** Commit lockfiles (`Cargo.lock` / `go.sum`). No ad-hoc
  system dependencies outside the declared toolchain.

## 5. Testing
- **Unit:** `cargo test` / `go test` — every public function has a test.
- **Property/fuzz:** For parsing, crypto, and FFI input handling, add property
  or fuzz tests (`proptest` / `cargo-fuzz` or Go fuzzing).
- **Integration:** Test the full FFI round-trip (TypeScript -> native -> TypeScript)
  in the application tier's integration suite.

## 6. Security & Auditing
- **Least privilege:** Request only the OS capabilities the module needs.
- **Logging:** Log all elevated-privilege operations through the shared logger
  contract; never `println!`/`log.Println` raw secrets.
- **Escalation:** Destructive or privileged operations require prior `@manager`
  approval via `send_agent_message` before execution.
- **Supply chain:** Audit native dependencies (`cargo audit` / `govulncheck`).

## 7. Handoff Contract
- You MUST run `run_tests` (which maps to `cargo test` / `go test`) on every
  native change. Never claim "done" to `@manager` with failing or missing tests.
- Hand off to `@quality` only with: green tests, no `unsafe`/`unsafe`-free audit
  notes, a versioned ABI contract, and updated `docs/`.
