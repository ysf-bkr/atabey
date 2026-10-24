/**
 * Local, opt-in error diagnostics.
 *
 * Design constraints (deliberate):
 *
 *  1. **Local first.** A report is always written to
 *     `.atabey/logs/error-reports/<id>.json` before anything else happens, so a
 *     failed upload never loses the failure.
 *  2. **Nothing is sent automatically.** Upload requires explicit user consent
 *     (`ATABEY_TELEMETRY=1` plus either a `--report` flag or an interactive
 *     "yes"). Default is off; a non-interactive/CI run never prompts.
 *  3. **No project content.** Never includes file contents, `.env` values,
 *     prompt/task text, or environment variable *values*. Only names/structure
 *     needed to debug are kept.
 *  4. **No absolute paths.** The home directory becomes `~`, the project root
 *     becomes `<project>`, and any remaining absolute path is reduced to its
 *     basename so usernames do not leak.
 *  5. **Secrets are redacted twice.** `maskText()` (PII) and `scanForSecrets()`
 *     (credentials) run over the final string fields, and the result is then
 *     re-scanned; if anything still matches, the offending value is dropped.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { maskText } from "atabey-shared/pii.js";
import { scanForSecrets } from "atabey-shared/secrets.js";

export type ReportStage =
    | "startup"
    | "config-read"
    | "config-refresh"
    | "standards"
    | "agents"
    | "skills"
    | "shims"
    | "mcp-config"
    | "gitignore"
    | "index"
    | "unknown";

export interface ErrorReport {
    /** Stable id used in the user-facing message and the file name. */
    id: string;
    createdAt: string;
    atabeyVersion: string;
    nodeVersion: string;
    platform: string;
    osRelease: string;
    arch: string;
    command: string;
    stage: ReportStage;
    errorName: string;
    errorCode?: string;
    message: string;
    stack?: string;
    /** Names only — never values. */
    envFlags?: string[];
}

export interface BuildReportInput {
    command: string;
    stage?: ReportStage;
    error: unknown;
    projectRoot: string;
    atabeyVersion: string;
}

/** Environment variables that describe *behaviour* (safe) rather than secrets. */
const REPORTABLE_ENV_FLAGS = [
    "MCP_TRANSPORT",
    "ATABEY_SANDBOX_RUNTIME",
    "ATABEY_SANDBOX_REQUIRED",
    "ATABEY_TOKEN_BUDGET_ENFORCE",
    "ATABEY_ENFORCE_UNAUDITED_WRITES",
    "CI",
] as const;

/** Matches things that look like a credential in free text. */
const INLINE_SECRET = /\b(sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|xai-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{30,}|Bearer\s+[A-Za-z0-9._~+/=-]{12,})\b/g;

function newReportId(): string {
    // Short, sortable, and unique enough for a local file: RPT-<date>-<hex>
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return `RPT-${stamp}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Removes identifying information from a free-text string.
 * Order matters: paths first (they contain the username), then PII, then secrets.
 */
export function sanitizeText(text: string, projectRoot: string): string {
    if (!text) return "";
    let out = text;

    // Project root FIRST: it usually lives under the home directory, so replacing
    // the home prefix first would leave `<home>/Desktop/.../my-project` behind and
    // leak the project name.
    if (projectRoot) {
        out = out.split(projectRoot).join("<project>");
        // Also handle the symlink-resolved form (macOS /var vs /private/var).
        try {
            const real = fs.realpathSync(projectRoot);
            if (real !== projectRoot) out = out.split(real).join("<project>");
        } catch {
            /* project may not exist when a startup failure happens */
        }
    }
    const home = os.homedir();
    if (home && home !== "/") {
        out = out.split(home).join("~");
    }

    // Any remaining absolute path: keep the last two segments only.
    out = out.replace(/(?:\/Users|C:\\Users|\/home)\/[^\s:'"()]+/g, (match) => {
        const parts = match.split(/[\\/]/).filter(Boolean);
        return `<path>/${parts.slice(-2).join("/")}`;
    });

    out = maskText(out);
    out = out.replace(INLINE_SECRET, "***-REDACTED-***");

    // Final guard: if a credential pattern survives, drop the whole value.
    if (scanForSecrets(out).length > 0) {
        return "<redacted: contained a value that looked like a credential>";
    }
    return out;
}

function errorDetails(error: unknown): { name: string; code?: string; message: string; stack?: string } {
    if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code;
        return {
            name: error.name || "Error",
            code: typeof code === "string" ? code : undefined,
            message: error.message,
            stack: error.stack,
        };
    }
    if (typeof error === "string") return { name: "Error", message: error };
    try {
        return { name: "Error", message: JSON.stringify(error) };
    } catch {
        return { name: "Error", message: String(error) };
    }
}

/** Builds a sanitized report. Pure: performs no I/O except reading the realpath. */
export function buildErrorReport(input: BuildReportInput): ErrorReport {
    const { name, code, message, stack } = errorDetails(input.error);

    const envFlags = REPORTABLE_ENV_FLAGS.filter((key) => {
        const value = process.env[key];
        return value !== undefined && value !== "";
    }).map((key) => `${key}=${process.env[key] === "true" || process.env[key] === "false" ? process.env[key] : "<set>"}`);

    return {
        id: newReportId(),
        createdAt: new Date().toISOString(),
        atabeyVersion: input.atabeyVersion,
        nodeVersion: process.versions.node,
        platform: process.platform,
        osRelease: os.release(),
        arch: process.arch,
        command: input.command,
        stage: input.stage ?? "unknown",
        errorName: name,
        errorCode: code,
        message: sanitizeText(message, input.projectRoot),
        stack: stack ? sanitizeText(stack, input.projectRoot) : undefined,
        envFlags: envFlags.length > 0 ? envFlags : undefined,
    };
}

export function reportsDir(projectRoot: string): string {
    return path.join(projectRoot, ".atabey", "logs", "error-reports");
}

/** Writes the report and returns its path. Throws only if the filesystem is unusable. */
export function writeErrorReport(report: ErrorReport, projectRoot: string): string {
    const dir = reportsDir(projectRoot);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, `${report.id}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
    return file;
}

/** Reads back a previously written report (used by `atabey report <id>`). */
export function readErrorReport(id: string, projectRoot: string): ErrorReport | null {
    const file = path.join(reportsDir(projectRoot), `${id}.json`);
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, "utf8")) as ErrorReport;
    } catch {
        return null;
    }
}

export function listErrorReports(projectRoot: string): string[] {
    const dir = reportsDir(projectRoot);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
        .filter((f) => f.startsWith("RPT-") && f.endsWith(".json"))
        .sort()
        .reverse();
}

/** Human-readable body used for a GitHub issue or endpoint POST. */
export function formatReport(report: ErrorReport): string {
    const lines = [
        `### Atabey error report ${report.id}`,
        "",
        "| field | value |",
        "|---|---|",
        `| Atabey | ${report.atabeyVersion} |`,
        `| Node | ${report.nodeVersion} |`,
        `| OS | ${report.platform} ${report.osRelease} (${report.arch}) |`,
        `| Command | \`${report.command}\` |`,
        `| Stage | \`${report.stage}\` |`,
        `| Error | ${report.errorName}${report.errorCode ? ` (${report.errorCode})` : ""} |`,
        `| Created | ${report.createdAt} |`,
        "",
        "**Message**",
        "",
        "```",
        report.message,
        "```",
    ];
    if (report.stack) {
        lines.push("", "<details><summary>Stack trace</summary>", "", "```", report.stack, "```", "", "</details>");
    }
    if (report.envFlags?.length) {
        lines.push("", "**Non-secret environment flags**", "", "```", ...report.envFlags, "```");
    }
    lines.push(
        "",
        "---",
        "_Generated by `atabey` with a redacted local report. No project files, `.env` values or environment variable values are included._",
    );
    return lines.join("\n");
}

// ─── Telemetry / consent ─────────────────────────────────────────────────────

export interface TelemetrySettings {
    enabled: boolean;
    /** Where to POST. Unset → GitHub issue path (if `gh` exists) or manual link. */
    endpoint?: string;
    /** Issue repository for the GitHub path, e.g. "owner/repo". */
    repo?: string;
}

/**
 * Resolution order: explicit config section → environment.
 * Default is OFF. A value other than an explicit truthy token keeps it off, so
 * a typo cannot silently enable uploads.
 */
export function resolveTelemetry(projectRoot: string): TelemetrySettings {
    let config: Record<string, unknown> = {};
    try {
        const configPath = path.join(projectRoot, ".atabey", "config.json");
        if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
    } catch {
        /* unreadable config → fall back to env */
    }

    const section = (config.telemetry ?? {}) as Record<string, unknown>;
    const envEnabled = process.env.ATABEY_TELEMETRY;
    const enabled = typeof section.enabled === "boolean"
        ? section.enabled
        : envEnabled === "1" || envEnabled === "true";

    return {
        enabled,
        endpoint: typeof section.endpoint === "string"
            ? section.endpoint
            : process.env.ATABEY_REPORT_ENDPOINT || undefined,
        repo: typeof section.repo === "string"
            ? section.repo
            : process.env.ATABEY_REPORT_REPO || undefined,
    };
}

/**
 * Pre-filled "new issue" link. GitHub rejects very long query strings, so the
 * body is only included when it comfortably fits; otherwise the link carries the
 * title plus a hint, and the user pastes `atabey report --show <id>` output.
 */
export function manualReportUrl(report: ErrorReport, repo = "ysf-bkr/atabey"): string {
    const title = encodeURIComponent(`[error-report] ${report.errorName} at ${report.stage} (${report.id})`);
    const full = formatReport(report);
    const body = encodeURIComponent(full);
    const base = `https://github.com/${repo}/issues/new?labels=bug%2Cerror-report&title=${title}`;
    // Keep the printed link short enough to stay readable in a terminal; a
    // report that does not fit gets a compact link plus the paste hint below.
    if (body.length <= 1800) return `${base}&body=${body}`;
    const hint = encodeURIComponent(
        `<!-- Report id: ${report.id} -->\nPaste the output of \`atabey report --show ${report.id}\` here.\n`,
    );
    return `${base}&body=${hint}`;
}

export interface SubmitResult {
    submitted: boolean;
    /** How it was sent, for the user-facing message. */
    via?: "endpoint" | "github";
    url?: string;
    error?: string;
}

/**
 * Best-effort upload. Never throws: the caller keeps the local file regardless.
 * Callers must have already obtained consent.
 */
export async function submitErrorReport(
    report: ErrorReport,
    settings: TelemetrySettings,
    options: { useGh?: boolean } = {},
): Promise<SubmitResult> {
    if (settings.endpoint) {
        try {
            const res = await fetch(settings.endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(report),
                signal: AbortSignal.timeout(10_000),
            });
            if (!res.ok) return { submitted: false, via: "endpoint", error: `HTTP ${res.status}` };
            return { submitted: true, via: "endpoint", url: settings.endpoint };
        } catch (err) {
            return { submitted: false, via: "endpoint", error: (err as Error).message };
        }
    }

    if (options.useGh && settings.repo) {
        try {
            const { execFileSync } = await import("child_process");
            const url = execFileSync(
                "gh",
                ["issue", "create", "--repo", settings.repo, "--title",
                    `[error-report] ${report.errorName} at ${report.stage} (${report.id})`,
                    "--body-file", "-", "--label", "bug"],
                { input: formatReport(report), encoding: "utf8", timeout: 20_000 },
            ).trim();
            return { submitted: true, via: "github", url };
        } catch (err) {
            return { submitted: false, via: "github", error: (err as Error).message };
        }
    }

    return { submitted: false, error: "no submission target configured" };
}
