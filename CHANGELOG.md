# Changelog — Atabey

All notable changes to this project are documented in this file.

> **Note on project history (2026-10-21):**
> Atabey was developed — and published to npm — before this entry, up to and
> including v0.1.4. As part of the repository re-baseline, the original Git
> history and the per-release notes prior to v0.1.5 were intentionally removed.
> This changelog restarts with v0.1.5. For the legacy release series, see the
> published npm packages (`atabey`, `atabey-mcp`, `atabey-shared`).

---

## [0.1.7] — 2026-10-23 — Positioning, Documentation & Dead-Code Cleanup

No runtime behavior change in this part of the release. It records what was reworded and
which claims were narrowed so the docs match the implementation.

### Changed — product positioning
- Unified the product statement as **“local governance and verification layer for AI coding
  agents”** across the root README (EN + TR), package READMEs, `package.json` metadata and the
  CLI banner.
- Removed the implication that Atabey is an “AI Engineering Control Plane” / “Local AI Control
  Plane & Discipline Layer”, or a substitute for LangGraph/CrewAI.
- “13 specialized agents” is now consistently **“13 role profiles”** (prompt + task blueprint
  injected into the host), matching `docs/limitations.md` §2.

### Changed — claims narrowed to what the code supports
- **Fail-closed** is now scoped: it applies when policy/auth/TLS enforcement is enabled. The
  open-access default (`SECURITY.md`) is stated explicitly instead of being contradicted.
- **“Immutable” audit log** → **tamper-evident / detectable** audit chain.
- **“100% local”** → **local by default**; optional OpenAI embeddings send text to the OpenAI
  API when `OPENAI_API_KEY` is set.
- **KVKK/GDPR “compliance”** → **technical controls**, not a legal declaration or certification.
- Platform enforcement table now states that native host tools can bypass MCP controls.
- Benchmark section explicitly says **results pending**; no comparative results are implied.

### Fixed — inventory drift
- Standards count corrected to **36** (was “30+”, “33” and “26+” in different files).
- `packages/atabey/PRIVACY.md` re-synced with the root `PRIVACY.md` (it was stale and shipped
  with the npm package).
- Removed stale Gemini CLI support from `ATABEY_FULL.md` (unsupported since v0.1.5).
- Root README version badge/tagline updated to v0.1.7.

### Removed — dead / unsupported surface
- `gemini-cli` keyword removed from all four `package.json` files (`ai-agents` and
  `orchestration` demoted in favour of governance/verification terms).
- Stale Freelancer/Team/Enterprise columns and “all 13 specialists” framing in docs.

### Fixed — CI-blocking issues
- **`atabey check` failed on its own repository** (and therefore the CI step
  `npm run atabey:check`): the hardcoded-secret heuristic let its regex span newlines, so the
  empty templates in the `.env.example` scaffold (`"# OPENAI_API_KEY="`) were reported as a
  hardcoded key. The value class now excludes `\r\n` in both scanners (`atabey` CLI and
  `atabey-mcp`), so real one-line secrets are still flagged. Regression tests added.
- **Coverage gates failed** in `atabey-shared` and `atabey-mcp`. Tests were added rather than
  thresholds lowered: HITL approvals + cost ledger, atomic fs helpers, PII/list_dir/health
  handlers, and control-plane RBAC/locking. Thresholds were then ratcheted up to the new
  measured baseline (shared 70/80/59/68, mcp 58/66/50/57, atabey 61/72/50/60).

### Added — documented audit verification actually exists
- **`atabey audit export --verify [--in <file>]`** is implemented. README advertised this flag
  but the command ignored it (no verification ran). It now verifies the SHA-256 content hash and
  the keyed HMAC signature, rejects a bundle whose `count` disagrees with its entries, and exits
  non-zero on failure. `--format csv --verify` is rejected with an explanation.
- The signed payload now covers `count` (canonical `v: 2`). Previously `count` sat outside the
  hash, so a tampered count still verified. Bundles exported before this change must be
  re-exported.

### Fixed — memory correctness
- **Mixed-provider vectors were compared.** TF-IDF vectors are zero-padded to 1536 to fit the
  schema, so they matched the OpenAI length and were scored against OpenAI vectors with cosine
  similarity — numerically valid, semantically meaningless. Vectors are now tagged with
  `embeddingProvider`, the store only scores same-provider rows, legacy rows are classified by
  inspecting the padding, and routing skips the semantic blend when providers differ.
  `isOpenAIEmbedding()` no longer treats "length 1536" alone as proof of an OpenAI vector.
- **`agent-loop` marked delegations `PROCESSED` at enqueue time**, hiding execution failures.
  Successful runs now set `PROCESSED`, failures set `FAILED`, and a process death mid-run leaves
  the message `PENDING` for retry (at-least-once).

### Fixed — inventory drift
- CLI command count corrected to **33** (was 31 / "30+").
- `PRIVACY.md` retention table now matches the code: messages/logs 30 days, audit 30 default
  with a **90-day hard cap**, tasks/costs/approvals without automatic expiry. The
  `RETENTION_POLICIES` 180/365/730-day targets are documented as unenforced.
- `PRIVACY.md` now documents the optional OpenAI embedding transfer explicitly.
- Type-only fix: handlers with schema defaults (`acquire_lock`, `register_agent`) accept
  `z.input` types, so omitting a defaulted field type-checks and the runtime default is reachable.

### Fixed — AI tool configuration was silently wrong for two adapters

Verified against the vendors' published docs before changing anything.

- **Codex never loaded Atabey.** The adapter wrote a root `.mcp.json`, but Codex reads
  TOML `[mcp_servers.<name>]` from `~/.codex/config.toml` or `.codex/config.toml`
  (trusted projects only). The file looked like an integration and was never read.
  It now writes `.codex/config.toml` through a small TOML emitter that replaces only
  Atabey's table and preserves the rest of the user's config.
- **GitHub Copilot / VS Code was aliased to Codex.** They use different files and
  formats: VS Code reads JSON with a top-level `servers` object. A new `copilot` adapter
  writes `.vscode/mcp.json`; `copilot`/`github`/`vscode` now resolve to it, not `codex`.
  `.vscode/mcp.json` is no longer deleted as a "stale duplicate" — it is a native config.
- **The Claude Code hook would never have run, and would not have blocked if it had.**
  Three separate defects:
  1. `settings.json` put `command` on the matcher group; the documented shape is
     event → matcher group → nested `hooks: [{ type: "command", command }]`.
  2. Blocking used `process.exit(1)`, which is a *non-blocking* error in Claude Code.
     It now emits `hookSpecificOutput.permissionDecision: "deny"` on exit 0.
  3. It read `payload.input.command`; the documented field is `tool_input.command`.
  The hook also blocked nothing for Atabey's own tools (they were not excluded) and
  overwrote any user hooks/permissions in `settings.json`. It now leaves
  `mcp__atabey__*` alone, merges into existing settings, and covers `PowerShell` and
  more shell-write patterns. Verified by executing the generated script with real
  Claude-shaped payloads (13 tests).

### Changed — adapters are labelled by what was actually verified

- `AdapterConfig` gained `support: "verified" | "experimental"` and a `supportNote`.
  Grok, Antigravity and local-model adapters are **experimental**: no published config
  contract to check against, and a model server (Ollama/vLLM/LM Studio) is not an MCP
  host. `atabey init` prints the experimental adapters and tells the user to confirm the
  connection manually.
- New `docs/ai-tool-support.md` separates *config written* / *config verified* /
  *client connected*, lists the exact file per adapter, and gives a manual checklist.
  **No adapter is claimed as connected** — that requires running the real client.
- README platform table no longer advertises "Full/Strong/Partial governance" per
  platform; it states the config file, the enforcement model (Claude hooks vs MCP-only)
  and the verification level. `docs/limitations.md` §3 spells out what the hook does and
  does not catch.
- Adapter count corrected to 8 across docs, `UNIFIED_ADAPTER_SLUG` and the CLI help.
- Generated `.gitignore` now also covers `.codex/` and the generated
  `.github/copilot-instructions.md` / `.github/instructions/`.
- The Copilot adapter had **no instruction shim at all** (`SHIM_TEMPLATES` had no `copilot`
  key), so `atabey init copilot` produced MCP config plus agents but no top-level
  instructions file. Added; the Codex shim also no longer calls itself "Copilot".

### Added — adapter test coverage
- `adapter_init.test.ts` rewritten: per-adapter config presence, schema assertions for
  `mcpServers` / `servers` / TOML / `mcp`, idempotency, and preservation of pre-existing
  user config.
- New `claude_hook.test.ts` (settings schema, merge, idempotency, deny/allow behaviour,
  exit codes) and `toml.test.ts` (quoting, Windows paths, table replacement, idempotency).

### Security — dependency advisories cleared
- `npm audit --audit-level=high --omit=dev` is now **0 vulnerabilities** (was 2 high + 1
  moderate, which would fail the CI `security-scan` job):
  - **zod 3 → 4.6.7** (GHSA-mrhx-c7xc-m3w5, memory exhaustion via unbounded array
    validation). `@modelcontextprotocol/sdk` already declares `zod: ^3.25 || ^4.0`, so no SDK
    fork was needed. Migration details: `error.errors` → `error.issues`,
    `z.record(value)` → `z.record(key, value)`, and `zodToMcpSchema` now uses Zod 4's
    `z.toJSONSchema({ io: "input" })` instead of walking `_def` internals (which changed shape).
  - **body-parser 2.3.x → patched** and **fast-uri 3.1.8 → 3.1.9+** via `npm audit fix`
    (transitive through `@modelcontextprotocol/sdk` → `express` / `ajv`).
- New `npm run audit:prod` script and `npm run verify`, which runs the full CI sequence
  locally (build, typecheck, lint, tests, coverage, README sync, knip, audit, `atabey check`).

### Fixed — MCP tool schemas
- The generated `inputSchema` for all 40 tools is now derived from Zod's own JSON Schema
  exporter. The previous hand-written walker read private `_def` fields, silently dropped
  constraints (patterns, min/max, defaults) and mis-flagged required fields for nested
  objects. Added `zod-to-mcp` tests plus an end-to-end assertion that the compiled server
  advertises exactly 40 tools over stdio.

### Fixed — flaky test and scaffold/gitignore drift
- **`send_message.test.ts` was racy.** It relied on wall-clock timing (20 retries × 500 ms ≈ 10 s)
  while the lock goes stale after 15 s, and it shared one directory inside the repo across runs.
  Under coverage + parallel files the retry loop crossed 15 s, the product correctly stole the
  stale lock, and the test failed for the wrong reason; leftover `backend.lock` / `backend.json`
  also broke two neighbouring tests. Each test now uses its own `mkdtemp` directory and refreshes
  the lock mtime while it runs, so "busy" stays busy regardless of machine load.
- **`updateGitIgnore` contradicted itself in a framework checkout.** It appended
  "the brain is COMMITTED on purpose" below the repo's existing `/.atabey/` ignore. The
  consumer state/brain block is now skipped when the whole framework dir is ignored, and blocks
  are only appended when an actual ignore entry is missing (no stray comment lines on every
  `atabey update`). Two regression tests added.

### Verified
- `npm run verify` (build, `tsc --noEmit`, lint, 962 tests in 129 test files, coverage above
  thresholds in all 3 workspaces, `readme:check`, `knip`, `npm audit --omit=dev` = 0,
  `atabey check`) exits 0. `npm audit --audit-level=high` also reports 0, including dev deps.

### Verified (earlier in this release)
- `npm run build`, `npx tsc --noEmit`, `npm test`, `npm run test:coverage`, `npm run lint`,
  `npx knip`, `npm run readme:check`, `npx atabey check` (exit 0).

### Memory Round-Trip Fixes, `atabey update`, OTLP Observability

### Fixed (found via full end-to-end npm-install testing)
- **Split-brain (CLI vs MCP database):** the framework-directory resolver let a
  monorepo root override the NEAREST `.atabey`. A consumer project inside a
  workspace had its CLI writes land in the parent repo's database while the MCP
  server (respecting `ATABEY_PROJECT_ROOT`) read the child's — "indexed 84
  files" but every `search_knowledge` came back empty. Nearest `.atabey` now
  wins; workspace subpackages without their own `.atabey` still resolve upward.
- **`update_project_memory` MCP tool was a silent no-op:** it shelled out to a
  CLI subcommand that does not exist (`atabey update_project_memory` — the real
  command is `atabey memory update`) and the failure was swallowed while the
  tool reported success. It now calls the in-process memory API.
- **Memory state round-trip:** `updateDocumentStore("state")` wrote only
  `state.json` while `readState()` read from SQLite metadata — writes never
  surfaced in `status` or the synced `PROJECT_MEMORY.md`. State writes now sync
  to the metadata store, and `readState()` returns ALL metadata so custom
  memory sections render (the old 3-field version made the markdown
  custom-section renderer dead code). Verified live: update → read →
  PROJECT_MEMORY.md all agree.

### Added
- **`atabey update`:** non-destructive scaffold refresh after a package
  upgrade. Regenerates compiled output (constitution, standards, agents,
  skills, shims, platform MCP configs, gitignore rules) while preserving the
  living state — memory, imported knowledge, permission matrix, auth key.
  Reports the scaffold version delta; never scaffolds the app skeleton,
  re-ingests, or prompts.
- **Observability (OTLP):** span export now supports auth headers via
  `OTEL_EXPORTER_OTLP_HEADERS` and a Langfuse convenience pair
  (`ATABEY_LANGFUSE_PUBLIC_KEY` / `ATABEY_LANGFUSE_SECRET_KEY` — basic auth
  against the Langfuse OTLP endpoint). Datadog and Arize ingest the same OTLP
  stream with their API keys; local JSONL spans remain the zero-config
  default. `Storage.getAllMetadata()` added for full-state reads.

### Verified
- Live consumer project (inside a workspace): `index` → 84 entries in the
  project's OWN database (parent untouched at 288); `search_knowledge` finds
  the project source; memory update/read/markdown-sync round-trip green;
  `atabey update` preserves user data and keeps `check` green.
- Full suite: 118 files / 802 tests, eslint, knip, readme:check.

---

## [0.1.6] — 2026-10-22 — Single Setup, Per-AI Compile & Platform Hardening

### Breaking Changes
- **Profile system removed:** `--profile freelancer|team|enterprise` is gone.
  There is now **one canonical setup** — all 13 specialists, strictest governance
  posture (consent-basis compliance, fail-closed sandbox, required auth).
- **Gemini CLI is no longer a supported platform.** `atabey init gemini` warns
  and falls back to `claude`. `.gemini/`, `GEMINI.md` and the gemini adapter are
  removed; `toGeminiCliMd` remains internally as the Grok markdown format.
- **`--unified` / `--single` flags removed.** Use `atabey init all` to compile
  for every supported AI; `atabey init <ai>` (default `claude`) for one platform.
- **Root MCP config renamed:** `mcp.json` → standard `.mcp.json`.

### Fixed
- **MCP `MODULE_NOT_FOUND` crashes:** generated MCP entries now use the portable
  `npx -y atabey-mcp` launcher instead of a `node node_modules/...` path. Works
  with or without a local install and is immune to IDE working-directory drift.
- **Port crash on `EADDRINUSE`:** the HTTP/SSE hub now falls back automatically
  to the next free port (5858→5878 range) and prints the actually bound port.
  Strict mode: `ATABEY_PORT_STRICT=true`.
- **Agents invisible in discovery UIs:** every generated agent `.md` (including
  the Antigravity `agent.md` stubs) now starts with `name`/`description` YAML
  frontmatter.
- **Skills undiscoverable:** skills are scaffolded as `skills/<slug>/SKILL.md`
  with YAML frontmatter (Claude/Antigravity/AGENTS.md-ecosystem layout). Legacy
  flat `skills/<name>.md` files are migrated (removed) on re-init.

### Changed
- **One native MCP config per platform** (no more duplicates): Claude/Codex →
  root `.mcp.json`, Cursor → `.cursor/mcp.json`, Grok → `.grok/mcp_config.json`,
  Local LLM → `.atabey/mcp_config.json`, Antigravity → `.agents/mcp_config.json`,
  OpenCode → `opencode.json`. Stale duplicate files from older layouts
  (`mcp.json`, `.claude/mcp_config.json`, `.gemini/mcp.json`, `.vscode/mcp.json`,
  `.opencode/mcp_config.json`) are cleaned up on re-init.
- **Existing-project doc import:** `atabey init` detects root-level project docs
  and offers to import them into `.atabey/knowledge/imported/` (root copies are
  removed so all context lives under Atabey control). Non-interactive:
  `--import-docs`.
- **Bootstrap trace T-001:** a fresh init opens the first active task in project
  memory instead of leaving empty tables.
- **Automatic RAG indexing:** init now indexes the codebase into Vector Memory
  (content + tags, TF-IDF/OpenAI embeddings, FTS) and the incremental
  symbol/import graph, so agents answer "what does this code do / where is X
  defined" from the local DB without re-scanning. `--skip-index` opts out;
  `atabey index` rebuilds manually. The `packages/` directory is only excluded
  inside the Atabey framework monorepo itself — consumer monorepos are fully
  indexed.
- `atabey:setup` script now runs `atabey init all --yes`.

### Security & Correctness (full-project audit fixes)
- **Hub bridge isolation:** a stdio MCP process no longer silently attaches to
  whatever hub answers on 5858. Bridging now requires `ATABEY_ALLOW_HUB_BRIDGE=true`
  AND a verified match of project root AND server version (both exposed via
  `/mcp/health`). Cross-project tool-call leakage and hub hijacking are closed.
- **RBAC hardening:** `.atabey/config.json`, `.atabey/*.db`, `.atabey/agents/*.md`
  and `ATABEY.md` are protected write paths in BOTH the MCP permissions layer and
  the shared PolicyGate (governance self-modification closed). Anonymous callers
  on the network (unified) transport are now default-DENY.
- **Shell hardening:** `isWriteCommand` recognizes formatters and stash/clean
  (`go fmt`, `cargo fmt`, `dotnet format`, `ruff format`, `git stash`, ...);
  `run_shell_command` argument strings are scanned for protected/secret paths
  (`mv .env .env.bak`, `cat .env` are denied).
- **`check_lint` no longer uses a shell:** `execFile` with `shell:false` and
  argv splitting — shell metacharacters cannot be smuggled through lint commands.
- **`run_tests` hard timeout:** 10-minute default (`ATABEY_TEST_TIMEOUT_MS`) so a
  hung test runner can never block the agent loop.
- **Single-AI re-init no longer deletes other AIs' setups:** `.grok/` and
  `.opencode/` removed from the legacy-cleanup list (only the obsolete `.gemini/`
  is cleaned); Atabey-managed shims are no longer unlinked during brownfield
  ingestion.
- **Retention boot order:** data-retention cleanup starts only after the audit
  schema exists — the "no such table: audit_log" error on fresh installs is gone.
- **`atabey check` regression:** the MCP-config check accepts `.mcp.json` (or the
  local adapter config) and a regression test now covers init → check exit 0.
- **Env surface:** generated `.env.example` defaults `MCP_HOST=127.0.0.1`
  (was the network-exposed `0.0.0.0`); root `.env.example` documents 86 variables
  (was 40) and no longer tells users to "copy to .env" (no dotenv loader exists).
- **Removed `ATABEY_PROFILE`** leftovers (profile system is gone; production
  hardening now keys off `NODE_ENV=production` only).
- **Ops:** `prebuild` cleans stale `dist/` artifacts; release workflow no longer
  swallows `npm publish` failures (`|| true` removed); CI uploads the real
  coverage path (`packages/*/coverage/`); `mcp help` and `bin/cli.js` messages
  updated for the current platform/config matrix; docs headers re-versioned to
  v0.1.6; lockfile re-synced to 0.1.6.

### Git Discipline & Runtime Fixes (follow-up audit)
- **Consumer .gitignore is now managed by init** (`updateGitIgnore` was dead
  code — never called): compiled platform output (`.claude/`, `.agents/`,
  `.cursor/`, root shims, `.mcp.json`, `opencode.json`) and machine-local state
  (`.atabey/*.db`, `logs/`, `messages/`, locks, keys, `secrets.vault.json`) are
  ignored, while the brain — `.atabey/` memory, knowledge, constitution,
  permission matrix — is COMMITTED on purpose: it is the project's shared,
  versioned state. Previously a consumer `git commit` tracked everything,
  including the SQLite DB and the (encrypted) secrets vault.
- **Port fallback actually works now** (two integration bugs fixed, found via
  live testing): (1) attaching the Hermes WebSocketServer to a not-yet-listening
  server corrupted the EADDRINUSE flow — the error bypassed every handler and
  crashed the process; the bus now attaches only after the port is bound.
  (2) the listening callback was queued once per retry attempt, printing the
  startup banner and attaching the bus multiple times; it is now registered
  exactly once.
- Verified live: blocked port → `Port 39222 in use — falling back to port
  39223` → single banner → `/mcp/health` reports the bound port, version and
  project root.

### Dead Code Sweep & Auth Bootstrap (follow-up)
- **knip was configured to hide its findings** (`exclude: [exports, types,
  duplicates]`). After a full sweep the exclude list now only covers
  duplicates — unused exports/types fail `npm run knip` from now on.
- **26 dead declarations removed:** unused exports (`PhaseIDSchema`,
  `isGovernanceRiskyOperation`, `verifyRiskAndAwaitApproval`,
  `resolveContentLanguage`, `indexCodebaseMemory`, `getPackageManager`,
  `getDependencyVersions`, `exportAllAgents` (+ `ExportTarget`/`ExportedFile`),
  `listWorktreeModifiedFiles`, the `writeRootMcpConfig`/`CORE_FRAMEWORK_DIR`/
  `UNIFIED_HUB_DIR`/`CLI_PRESETS` re-exports), 13 unused exported types, the
  dead `isHighRiskOperation` + pattern list in the CLI compliance module (the
  MCP has its own live copy), and the deprecated `writeTextFileAtomic`/
  `appendFileSafe`/`buildAgentJson` aliases (tests now use canonical names).
  `DEFAULT_MONOREPO_PATHS` was inlined; `AtabeyStorage`/`Storage` remain as the
  one intentional alias pair (both actively used).
- **Auth bootstrap:** a fresh strict install no longer locks itself out of the
  HTTP/SSE API. `atabey init` generates a random 32-byte token into
  `.atabey/auth.key` (0600, gitignored, protected from agent writes); the MCP
  auth module reads it when `MCP_AUTH_TOKEN` is unset (logged as
  `source: auth.key`).
- **`atabey status` fails loudly in uninitialized directories** — `readState()`
  always returns fallback defaults, so the old null check was dead code and a
  bare directory printed phantom `PHASE_0/T-000` state. Status now checks the
  init marker (`.atabey/config.json`) and exits 1 with a clear error.

### Security & Reliability (second audit round)
- **Hermes WSS bus is no longer an unauthenticated side channel:** the bus
  inherits the auth master token (`ATABEY_BUS_TOKEN` override, else the MCP
  master token from env / `.atabey/auth.key`), so `/bus` is never anonymously
  reachable when HTTP auth credentials exist. Startup logs now report
  `auth: token|open`.
- **Delegation loss fixed:** the agent loop marked messages PROCESSED *before*
  enqueueing them — a failed enqueue or a crash in between lost the work
  permanently. Messages are now marked only after a successful enqueue;
  enqueue failures leave them PENDING for retry.
- **Vault lock is fail-closed:** secret mutations that cannot acquire the
  vault lock within 5s now throw instead of running unlocked (concurrent
  writes previously clobbered each other with lost updates).
- **CodeGraph no longer wipes indexes on truncated scans:** when the file-scan
  cap (default 5000) is hit, the removal pass is skipped and a warning is
  logged — previously unscanned-but-indexed files were deleted as "removed".
- **Path containment is segment-based:** the framework-dir check used a naive
  `startsWith`, letting sibling paths (`/root/my-app-evil` for root
  `/root/my-app`) pass as inside the project.
- **Outbound proxy actually works:** `outboundRequest` accepted `proxyUrl` but
  silently connected directly. It now routes plain-HTTP targets via
  absolute-form requests and HTTPS targets via CONNECT tunnels (with proxy
  basic-auth support).
- **Vector memory category stays in sync:** the upsert now updates the
  searchable `category` column (previously only content/vector/metadata were
  updated, so category-filtered searches could return stale results).
- **Routing engine honors OPENAI_API_KEY:** semantic routing now uses the
  async embedding generator (OpenAI when configured, local TF-IDF fallback)
  instead of the sync local-only path the documentation contradicted.
- **clean:legacy fails loudly:** the legacy deprecation script exits 1 and
  lists failed packages instead of printing "Done!" after errors.
- Root tsconfig excludes local test fixtures (`test-app/`, `test-lab/`,
  `test-init/`) so scaffolded consumer apps never leak into type checks.
- README role table no longer shows the removed Freelancer/Team/Enterprise
  columns.

### Deferred (documented, not fixed in this release)
- Unifying the 3 `frameworkDir` resolvers and the duplicated compliance engine.
- Removing the `utils/` re-export shim layer (roadmap S12).
- Syncing agent frontmatter tool lists with the full 40-tool MCP surface.
- Side-effect-free package entry (`main`/`exports` currently start the CLI).
- Breaking the `atabey ↔ atabey-mcp` circular dependency.

### Documentation
- README (EN + TR) and package README templates updated for the new CLI surface,
  per-AI setup guide, single-config matrix and a new Troubleshooting section.

---

## [0.1.5] — 2026-10-21 — Repository Re-Baseline & Documentation Audit

### Repository
- **Clean single-commit baseline:** the repository was re-initialized; prior Git
  history and legacy tags are obsolete. Only the project source of truth is
  version-controlled.
- **Setup artifacts are no longer version-controlled:** the root governance
  scaffold (`.atabey/`) and all generated platform adapters (`.claude/`,
  `.cursor/`, `.gemini/`, `.grok/`, `.opencode/`, `.agents/`, root instruction
  shims, `mcp.json` / `.mcp.json` / `opencode.json`) are regenerated by
  `npm install` (postinstall → `atabey:setup`) or `atabey init`, and are now
  gitignored. This also removes machine-specific absolute paths (e.g.
  `ATABEY_PROJECT_ROOT`) from the repository.
- **CI:** added an explicit `atabey:setup` step after the build so
  `atabey check` finds its scaffold on fresh checkouts.
- **Testing convention:** init/scaffolding experiments must run inside an
  ignored scratch directory (`test-lab/`), never in the repository root.

### Documentation
- README (EN + TR): skill counts unified to the actual **15 core skills**;
  governance pipeline reordered to match the implemented middleware (PII
  arg-masking happens right after validation, produces an audit/telemetry copy
  only — raw args reach tool handlers, so file content is never corrupted);
  knowledge-base table aligned with the actual **36 standards**;
  `--lang` documented as a deprecated no-op; ASCII-safe `#turkce` anchor for
  the Turkish section.
- Package README templates (`docs/readme/`): same corrections (15 skills,
  36 standards, 14 prompt recipes, per-platform skill formats) — package
  READMEs are regenerated from these fragments via `npm run readme:build`.
- ROADMAP: standards count corrected (34 → 36).
- LIMITATIONS / THREAT_MODEL / benchmark protocol: version headers refreshed.

### Version
- All packages bumped to `0.1.5`; inter-package dependency ranges updated to
  `^0.1.5`.
