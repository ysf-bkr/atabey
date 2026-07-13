/**
 * Sandbox Runtime — Phase 1.1 execution isolation for agent shell commands.
 *
 * Modes (ATABEY_SANDBOX_RUNTIME):
 *   none      — host spawn (legacy; allow-list only)
 *   uid       — host spawn with uid/gid drop (see sandbox.ts)
 *   container — Docker/Podman run with network=none, resource limits, project mount
 *   auto      — container if engine available, else uid if configured, else none
 *
 * Enterprise hardening:
 *   ATABEY_SANDBOX_REQUIRED=true  → deny execution when isolation is effectively "none"
 *
 * Container defaults:
 *   ATABEY_SANDBOX_ENGINE=podman|docker|auto  (prefer podman, then docker)
 *   ATABEY_SANDBOX_IMAGE=node:20-bookworm-slim
 *   ATABEY_SANDBOX_MEMORY=512m
 *   ATABEY_SANDBOX_CPUS=1
 *   ATABEY_SANDBOX_PIDS=256
 *   ATABEY_SANDBOX_NETWORK=none
 */

import { spawn, type ChildProcess, type SpawnOptions, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import {
    applySandboxToSpawnOptions,
    resolveSandboxIdentity,
    sandboxSpawn,
} from "./sandbox.js";

export type SandboxRuntimeMode = "none" | "uid" | "container" | "auto";
export type SandboxEngine = "podman" | "docker" | "none";

export interface SandboxRuntimeConfig {
    mode: SandboxRuntimeMode;
    /** Resolved effective mode after auto detection. */
    effectiveMode: "none" | "uid" | "container";
    engine: SandboxEngine;
    image: string;
    memory: string;
    cpus: string;
    pidsLimit: number;
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
    /** Optional stdin payload (e.g. file content for container-mediated writes). */
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

/**
 * Detect available container engine (cached).
 */
export function detectContainerEngine(): SandboxEngine {
    if (cachedEngine) return cachedEngine;
    const prefer = envStr("ATABEY_SANDBOX_ENGINE", "auto").toLowerCase();

    const tryEngine = (name: "podman" | "docker"): boolean => {
        try {
            execFileSync(name, ["--version"], {
                encoding: "utf8",
                timeout: 3000,
                stdio: ["ignore", "pipe", "ignore"],
            });
            return true;
        } catch {
            return false;
        }
    };

    if (prefer === "podman" || prefer === "docker") {
        cachedEngine = tryEngine(prefer) ? prefer : "none";
        return cachedEngine;
    }

    if (tryEngine("podman")) {
        cachedEngine = "podman";
        return cachedEngine;
    }
    if (tryEngine("docker")) {
        cachedEngine = "docker";
        return cachedEngine;
    }
    cachedEngine = "none";
    return cachedEngine;
}

/** Test helper */
export function clearSandboxRuntimeCache(): void {
    cachedEngine = null;
}

/**
 * Resolve full runtime configuration for a project.
 */
export function resolveSandboxRuntimeConfig(projectRoot: string, timeoutMs?: number): SandboxRuntimeConfig {
    const mode = (envStr("ATABEY_SANDBOX_RUNTIME", "auto").toLowerCase() || "auto") as SandboxRuntimeMode;
    const engine = detectContainerEngine();
    const identity = resolveSandboxIdentity();
    const required = envBool("ATABEY_SANDBOX_REQUIRED", false);

    let effectiveMode: SandboxRuntimeConfig["effectiveMode"];
    if (mode === "none") {
        effectiveMode = "none";
    } else if (mode === "uid") {
        effectiveMode = identity.enabled ? "uid" : "none";
    } else if (mode === "container") {
        effectiveMode = engine !== "none" ? "container" : "none";
    } else {
        // auto
        if (engine !== "none") effectiveMode = "container";
        else if (identity.enabled) effectiveMode = "uid";
        else effectiveMode = "none";
    }

    return {
        mode: ["none", "uid", "container", "auto"].includes(mode) ? mode : "auto",
        effectiveMode,
        engine,
        image: envStr("ATABEY_SANDBOX_IMAGE", "node:20-bookworm-slim"),
        memory: envStr("ATABEY_SANDBOX_MEMORY", "512m"),
        cpus: envStr("ATABEY_SANDBOX_CPUS", "1"),
        pidsLimit: parseInt(envStr("ATABEY_SANDBOX_PIDS", "256"), 10) || 256,
        network: envStr("ATABEY_SANDBOX_NETWORK", "none"),
        required,
        projectRoot: path.resolve(projectRoot),
        timeoutMs: timeoutMs ?? parseInt(process.env.MCP_COMMAND_TIMEOUT_MS || "30000", 10),
    };
}

function isolationLabel(cfg: SandboxRuntimeConfig): string {
    if (cfg.effectiveMode === "container") {
        return `container/${cfg.engine} image=${cfg.image} network=${cfg.network} mem=${cfg.memory}`;
    }
    if (cfg.effectiveMode === "uid") {
        const id = resolveSandboxIdentity();
        return `uid=${id.uid}${id.gid !== undefined ? ` gid=${id.gid}` : ""}`;
    }
    return "none (host process)";
}

/**
 * Build docker/podman argv for an isolated run.
 * Project is mounted at /workspace; command runs with -w /workspace.
 */
export function buildContainerArgs(
    cfg: SandboxRuntimeConfig,
    command: string,
    args: string[],
): string[] {
    const root = cfg.projectRoot;
    // Prefer :rw so installs/builds work; network still none by default
    const mount = `${root}:/workspace:rw`;

    const argv: string[] = [
        "run",
        "--rm",
        "--network", cfg.network,
        "--memory", cfg.memory,
        "--cpus", cfg.cpus,
        "--pids-limit", String(cfg.pidsLimit),
        "-v", mount,
        "-w", "/workspace",
        // Drop ambient capabilities when supported (docker/podman)
        "--security-opt", "no-new-privileges",
    ];

    // Optional: read-only root FS with writable tmp (stronger isolation)
    if (envBool("ATABEY_SANDBOX_READ_ONLY_ROOT", false)) {
        argv.push("--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m");
    }

    // Do not pass host secrets by default — empty env except PATH-ish via image
    if (!envBool("ATABEY_SANDBOX_PASS_ENV", false)) {
        argv.push("--env", "HOME=/tmp", "--env", "NPM_CONFIG_UPDATE_NOTIFIER=false");
    }

    argv.push(cfg.image, command, ...args);
    return argv;
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
 * Run a command under the configured sandbox runtime.
 */
export async function runInSandbox(req: RunInSandboxRequest): Promise<RunInSandboxResult> {
    const cfg = resolveSandboxRuntimeConfig(req.projectRoot, req.timeoutMs);
    const label = isolationLabel(cfg);

    if (cfg.required && cfg.effectiveMode === "none") {
        throw new SandboxRequiredError(
            "[SANDBOX_REQUIRED] ATABEY_SANDBOX_REQUIRED=true but no isolation is available. " +
            "Install Podman/Docker (ATABEY_SANDBOX_RUNTIME=container) or configure ATABEY_SANDBOX_UID/USER " +
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

    if (cfg.effectiveMode === "container" && cfg.engine !== "none") {
        const containerArgs = buildContainerArgs(cfg, req.command, req.args);
        const child = spawn(cfg.engine, containerArgs, {
            cwd: cfg.projectRoot,
            timeout: cfg.timeoutMs,
            shell: false,
            stdio,
            env: req.env ?? process.env,
        });
        const result = await collectOutput(child, req.stdin);
        return {
            ...result,
            runtime: "container",
            engine: cfg.engine,
            isolationLabel: label,
        };
    }

    // uid or none — host spawn (uid options applied when available)
    const spawnOpts: SpawnOptions = {
        cwd: cfg.projectRoot,
        timeout: cfg.timeoutMs,
        shell: false,
        stdio,
        env: req.env ?? process.env,
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
 * Diagnostic snapshot for dashboard / CLI.
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
