# Error reports & telemetry

**Status:** local reports always on; sharing **off by default**.

Atabey writes a redacted error report to disk whenever a command fails
unexpectedly. Nothing is ever uploaded automatically.

## What happens when a command fails

```
$ npx atabey update
[ERROR] Atabey update failed (stage: standards, report: RPT-20261024-D9C161).
[INFO] Cause: Error ENOTDIR: not a directory, open '<project>/.atabey/knowledge/...'
[INFO] Details: .atabey/logs/error-reports/RPT-20261024-D9C161.json
[INFO] Sharing is off by default. Nothing was uploaded.
```

1. **A local report is written first** — before any network attempt, so a failed
   upload can never lose the failure.
2. **You get the stage** that broke (`config-read`, `config-refresh`, `standards`,
   `agents`, `skills`, `shims`, `mcp-config`, `gitignore`, or `unknown`), the report
   id and a path to the details.
3. **Sharing is off by default.** You get a prefilled GitHub issue link instead.

Expected, actionable failures (missing `.atabey/config.json`, a corrupt config
file) do **not** create a report — the message already tells you what to fix.

## What the report contains

| Included | Not included |
|---|---|
| Atabey version | Project file contents |
| Node.js version | `.env` contents or any file contents |
| OS + release + architecture | Environment variable **values** |
| Command name and failure stage | Prompt / task text |
| Error name, code (`ENOENT`, …), message | Your username or absolute paths |
| Sanitized stack trace | Tokens, API keys, passwords |
| Names of a few non-secret flags (`MCP_TRANSPORT=stdio`) | Session ids, chat content |

Redaction happens in two passes:

1. **Paths** — the project root becomes `<project>`, the home directory becomes `~`,
   and any other absolute user path is reduced to `<path>/<dir>/<file>`.
2. **Values** — PII masking (`maskText`) and credential scanning (`scanForSecrets`)
   run over every string. If a credential-shaped value still survives, the whole
   value is replaced rather than partially masked.

The file is written with owner-only permissions (`0600`) under
`.atabey/logs/error-reports/`, which is gitignored.

## Turning sharing on

Default is **off**. Enable it only if you want to be *asked* whether to upload:

```bash
export ATABEY_TELEMETRY=1
```

or, persistently, in `.atabey/config.json`:

```json
{ "telemetry": { "enabled": true } }
```

Config wins over the environment, so `"enabled": false` is an explicit off switch.
Only `1` / `true` enable it — a typo like `ATABEY_TELEMETRY=yes-please` stays off.

Even when enabled, Atabey **asks first** on an interactive terminal:

```
Send this redacted report to the Atabey maintainers? [y/N]
```

- Answer `n` (or press Enter) → the report stays local.
- In CI or any non-TTY session → Atabey never prompts and never uploads.

## Where reports go

| Setting | Effect |
|---|---|
| `ATABEY_REPORT_ENDPOINT` (or `telemetry.endpoint`) | `POST` the JSON report to your endpoint |
| `ATABEY_REPORT_REPO` (or `telemetry.repo`) + `gh` CLI | Open a GitHub issue in that repo |
| neither | Print a prefilled GitHub issue link (`ysf-bkr/atabey`) |

If the upload fails, the local report is kept and you get the manual link. Nothing
is retried automatically.

## Commands

```bash
atabey report                    # list local reports
atabey report --show RPT-…       # print one (redacted) report
atabey report --send RPT-…       # upload one (requires sharing enabled)
atabey report --status           # is sharing on? where would it go?
```

`--send` is still gated on the setting: with sharing off, it refuses instead of
uploading.

## Removing reports

```bash
rm -rf .atabey/logs/error-reports
```

They are local files only; nothing else references them.

## What this is not

- **Not crash telemetry in the background.** Nothing runs unless a command fails.
- **Not a guarantee of perfect redaction.** The filters cover paths, PII patterns
  and credential patterns; a novel secret format could slip through. Review a
  report with `atabey report --show` before sending if your project is sensitive.
- **Not the same as Atabey's audit trail.** The audit chain records tool calls; this
  records a CLI failure so you can report a bug.
