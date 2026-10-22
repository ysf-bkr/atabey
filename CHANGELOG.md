# Changelog — Atabey

All notable changes to this project are documented in this file.

> **Note on project history (2026-10-21):**
> Atabey was developed — and published to npm — before this entry, up to and
> including v0.1.4. As part of the repository re-baseline, the original Git
> history and the per-release notes prior to v0.1.5 were intentionally removed.
> This changelog restarts with v0.1.5. For the legacy release series, see the
> published npm packages (`atabey`, `atabey-mcp`, `atabey-shared`).

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
