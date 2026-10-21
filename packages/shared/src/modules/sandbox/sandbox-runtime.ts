/**
 * Sandbox Runtime — Pure local OS process isolation for agent commands (Zero Docker/Container).
 *
 * Modes (ATABEY_SANDBOX_RUNTIME):
 *   none      — host spawn (allow-list + env scrubbing)
 *   uid       — host spawn with POSIX uid/gid drop (see sandbox.ts)
 *   seatbelt  — macOS kernel sandbox (/usr/bin/sandbox-exec) confining writes to projectRoot
 *               and denying network access by default
 *   auto      — seatbelt if available on macOS, else uid if configured, else none
 *
 * Hardening:
 *   ATABEY_SANDBOX_REQUIRED=true  → deny execution when isolation is effectively "none"
 *   ATABEY_SANDBOX_NETWORK=none   → deny outbound/inbound network inside seatbelt (default: none)
 */

import { spawn, type ChildProcess, type SpawnOptions, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
    applySandboxToSpawnOptions,
    resolveSandboxIdentity,
    sandboxSpawn,
} from "./sandbox.js";
import { scrubEnvForSubprocess } from "../security/secrets.js";

export type SandboxRuntimeMode = "none" | "uid" | "seatbelt" | "auto";
export type SandboxEngine = "seatbelt" | "none";

export interface SandboxRuntimeConfig {
    mode: SandboxRuntimeMode;
    /** Resolved effective mode after auto detection. */
    effectiveMode: "none" | "uid" | "seatbelt";
    engine: SandboxEngine;
    network: string;
    required: boolean;
    projectRoot: string;
    timeoutMs: number;
}

export interface RunInSandboxRequest {
    command: string;
    args: string[];
    projectRoot: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    /** Optional stdin payload. */
    stdin?: string | Buffer;
}

export interface RunInSandboxResult {
    code: number | null;
    stdout: string;
    stderr: string;
    runtime: SandboxRuntimeConfig["effectiveMode"];
    engine: SandboxEngine;
    /** Human-readable isolation description for logs/errors. */
    isolationLabel: string;
}

export class SandboxRequiredError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SandboxRequiredError";
    }
}

export const SEATBELT_BINARY = "/usr/bin/sandbox-exec";

let cachedEngine: SandboxEngine | null = null;

function envStr(key: string, fallback: string): string {
    const v = process.env[key];
    return v && v.trim() ? v.trim() : fallback;
}

function envBool(key: string, fallback = false): boolean {
    const v = process.env[key];
    if (v === undefined) return fallback;
    return v === "true" || v === "1" || v === "yes";
}

let warnedDevUnsandboxed = false;

export function resolveDefaultSandboxRequired(_mode: SandboxRuntimeMode = "auto"): boolean {
    if (process.env.ATABEY_SANDBOX_REQUIRED !== undefined) {
        return envBool("ATABEY_SANDBOX_REQUIRED", true);
    }
    if (envBool("ATABEY_ALLOW_UNSANDBOXED", false)) {
        return false;
    }
    const profile = (process.env.ATABEY_PROFILE || "").toLowerCase();
    if (process.env.NODE_ENV === "production" || profile === "enterprise") {
        return true;
    }
    const isTestEnv = Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
    if (isTestEnv) {
        return false;
    }
    if (!warnedDevUnsandboxed) {
        warnedDevUnsandboxed = true;
        process.stderr.write(
            "[SANDBOX] No isolation enforced (local dev). Set ATABEY_SANDBOX_REQUIRED=true " +
            "to enforce OS process isolation (seatbelt/uid).\n",
        );
    }
    return false;
}

/**
 * Detect available native OS sandbox engine (cached).
 */
export function detectOsSandboxEngine(): SandboxEngine {
    if (cachedEngine) return cachedEngine;
    const prefer = envStr("ATABEY_SANDBOX_ENGINE", "auto").toLowerCase();

    if (prefer === "none") {
        cachedEngine = "none";
        return cachedEngine;
    }

    try {
        execFileSync(SEATBELT_BINARY, ["-p", "(version 1)(allow default)", "/usr/bin/true"], {
            encoding: "utf8",
            timeout: 3000,
            stdio: ["ignore", "pipe", "ignore"],
        });
        cachedEngine = "seatbelt";
        return cachedEngine;
    } catch {
        cachedEngine = "none";
        return cachedEngine;
    }
}

/** Test helper */
export function clearSandboxRuntimeCache(): void {
    cachedEngine = null;
}

/**
 * Resolve full runtime configuration for a project.
 */
export function resolveSandboxRuntimeConfig(projectRoot: string, timeoutMs?: number): SandboxRuntimeConfig {
    const rawMode = envStr("ATABEY_SANDBOX_RUNTIME", "auto").toLowerCase() || "auto";
    const mode: SandboxRuntimeMode = ["none", "uid", "seatbelt", "auto"].includes(rawMode)
        ? (rawMode as SandboxRuntimeMode)
        : "auto";
    const engine = detectOsSandboxEngine();
    const identity = resolveSandboxIdentity();
    const required = resolveDefaultSandboxRequired(mode);

    let effectiveMode: SandboxRuntimeConfig["effectiveMode"];
    if (mode === "none") {
        effectiveMode = "none";
    } else if (mode === "uid") {
        effectiveMode = identity.enabled ? "uid" : "none";
    } else if (mode === "seatbelt") {
        effectiveMode = engine === "seatbelt" ? "seatbelt" : "none";
    } else {
        // auto: prefer native OS seatbelt, then uid drop, else none
        if (engine === "seatbelt") effectiveMode = "seatbelt";
        else if (identity.enabled) effectiveMode = "uid";
        else effectiveMode = "none";
    }

    return {
        mode,
        effectiveMode,
        engine: effectiveMode === "seatbelt" ? "seatbelt" : "none",
        network: envStr("ATABEY_SANDBOX_NETWORK", "none"),
        required,
        projectRoot: path.resolve(projectRoot),
        timeoutMs: timeoutMs ?? parseInt(process.env.MCP_COMMAND_TIMEOUT_MS || "30000", 10),
    };
}

function isolationLabel(cfg: SandboxRuntimeConfig): string {
    if (cfg.effectiveMode === "seatbelt") {
        return `os/seatbelt network=${cfg.network} root=${cfg.projectRoot}`;
    }
    if (cfg.effectiveMode === "uid") {
        const id = resolveSandboxIdentity();
        return `uid=${id.uid}${id.gid !== undefined ? ` gid=${id.gid}` : ""}`;
    }
    return "none (host process)";
}

function escapeSbplString(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Build macOS Seatbelt (`/usr/bin/sandbox-exec`) SBPL profile and argv.
 * Confines file writes strictly to `projectRoot` and OS temp directories,
 * and denies network access when `cfg.network === "none"`.
 */
export function buildSeatbeltArgs(
    cfg: SandboxRuntimeConfig,
    command: string,
    args: string[],
): string[] {
    const resolvedRoot = fs.existsSync(cfg.projectRoot)
        ? fs.realpathSync(cfg.projectRoot)
        : path.resolve(cfg.projectRoot);
    const lexicalRoot = path.resolve(cfg.projectRoot);

    const allowPaths = new Set<string>([
        resolvedRoot,
        lexicalRoot,
        "/tmp",
        "/private/tmp",
        "/var/folders",
        "/private/var/folders",
    ]);

    const subpathRules = [...allowPaths]
        .map((p) => `(subpath "${escapeSbplString(p)}")`)
        .join(" ");

    const netRule = cfg.network === "none" ? "(deny network*)" : "";
    const profile = [
        "(version 1)",
        "(allow default)",
        netRule,
        '(deny file-write* (subpath "/"))',
        `(allow file-write* ${subpathRules} (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty"))`,
    ]
        .filter(Boolean)
        .join("");

    return ["-p", profile, command, ...args];
}

function collectOutput(
    child: ChildProcess,
    stdin?: string | Buffer,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
        child.on("error", (err) => {
            stderr += err.message;
            resolve({ code: 1, stdout, stderr });
        });
        child.on("close", (code) => {
            resolve({ code, stdout, stderr });
        });
        if (stdin !== undefined && child.stdin) {
            child.stdin.end(stdin);
        } else if (child.stdin) {
            child.stdin.end();
        }
    });
}

/**
 * Run a command under the configured local OS sandbox runtime.
 */
export async function runInSandbox(req: RunInSandboxRequest): Promise<RunInSandboxResult> {
    const cfg = resolveSandboxRuntimeConfig(req.projectRoot, req.timeoutMs);
    const label = isolationLabel(cfg);

    if (cfg.required && cfg.effectiveMode === "none") {
        throw new SandboxRequiredError(
            "[SANDBOX_REQUIRED] ATABEY_SANDBOX_REQUIRED=true but no OS isolation is available. " +
            "Use macOS seatbelt (ATABEY_SANDBOX_RUNTIME=seatbelt) or configure ATABEY_SANDBOX_UID/USER " +
            "(ATABEY_SANDBOX_RUNTIME=uid), or set ATABEY_SANDBOX_REQUIRED=false for local dev.",
        );
    }

    if (!fs.existsSync(cfg.projectRoot)) {
        throw new Error(`[SANDBOX] Project root does not exist: ${cfg.projectRoot}`);
    }

    const stdio: SpawnOptions["stdio"] = [
        req.stdin !== undefined ? "pipe" : "ignore",
        "pipe",
        "pipe",
    ];

    const baseEnv = req.env ?? process.env;
    const childEnv = envBool("ATABEY_SANDBOX_PASS_ENV", false)
        ? baseEnv
        : scrubEnvForSubprocess(baseEnv);

    if (!envBool("ATABEY_ALLOW_INTERACTIVE", false)) {
        const nonInteractive: NodeJS.ProcessEnv = {
            CI: "true",
            DEBIAN_FRONTEND: "noninteractive",
            GIT_TERMINAL_PROMPT: "0",
            GIT_ASKPASS: "echo",
            PAGER: "cat",
            TERM: "dumb",
            npm_config_yes: "true",
            PIP_NO_INPUT: "1",
        };
        for (const [k, v] of Object.entries(nonInteractive)) {
            if (childEnv[k] === undefined) childEnv[k] = v;
        }
    }

    if (cfg.effectiveMode === "seatbelt" && cfg.engine === "seatbelt") {
        const seatbeltArgs = buildSeatbeltArgs(cfg, req.command, req.args);
        const child = spawn(SEATBELT_BINARY, seatbeltArgs, {
            cwd: cfg.projectRoot,
            timeout: cfg.timeoutMs,
            shell: false,
            stdio,
            env: childEnv,
        });
        const result = await collectOutput(child, req.stdin);
        return {
            ...result,
            runtime: "seatbelt",
            engine: "seatbelt",
            isolationLabel: label,
        };
    }

    const spawnOpts: SpawnOptions = {
        cwd: cfg.projectRoot,
        timeout: cfg.timeoutMs,
        shell: false,
        stdio,
        env: childEnv,
    };

    const child =
        cfg.effectiveMode === "uid"
            ? sandboxSpawn(req.command, req.args, spawnOpts)
            : spawn(req.command, req.args, applySandboxToSpawnOptions({ ...spawnOpts, disableSandbox: true }));

    const result = await collectOutput(child, req.stdin);
    return {
        ...result,
        runtime: cfg.effectiveMode,
        engine: "none",
        isolationLabel: label,
    };
}

/**
 * Diagnostic snapshot for CLI.
 */
export function getSandboxRuntimeStatus(projectRoot = process.cwd()): {
    config: SandboxRuntimeConfig;
    isolationLabel: string;
    identity: ReturnType<typeof resolveSandboxIdentity>;
} {
    const config = resolveSandboxRuntimeConfig(projectRoot);
    return {
        config,
        isolationLabel: isolationLabel(config),
        identity: resolveSandboxIdentity(),
    };
}

