/**
 * OS-level subprocess isolation via uid/gid (no Docker required).
 *
 * On Unix, child_process.spawn accepts `uid` and `gid`. When configured,
 * agent-triggered shell commands run as a restricted system user so that
 * even a hallucinated destructive command hits EACCES / Permission Denied
 * on protected paths.
 *
 * Windows: uid/gid are ignored; isolation is a no-op (allow-list still applies).
 *
 * Configuration (any of):
 *   ATABEY_SANDBOX_UID=501
 *   ATABEY_SANDBOX_GID=20
 *   ATABEY_SANDBOX_USER=atabey-sandbox   (resolved via `id -u` / `id -g` when possible)
 *   ATABEY_SANDBOX_ENABLED=true|false   (default: true when uid/gid resolvable)
 */

import { spawn, SpawnOptions, ChildProcess } from "child_process";
import { execFileSync } from "child_process";
import os from "os";

export interface SandboxIdentity {
    uid?: number;
    gid?: number;
    user?: string;
    enabled: boolean;
    /** Why sandbox is off (for diagnostics). */
    reason?: string;
}

export interface SandboxSpawnOptions extends SpawnOptions {
    /** Force-disable sandbox for this call. */
    disableSandbox?: boolean;
}

let cachedIdentity: SandboxIdentity | null = null;

function parseUint(value: string | undefined): number | undefined {
    if (value === undefined || value === "") return undefined;
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return n;
}

function resolveUserIds(username: string): { uid?: number; gid?: number } {
    if (process.platform === "win32") return {};
    try {
        const uidRaw = execFileSync("id", ["-u", username], {
            encoding: "utf8",
            timeout: 2000,
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        const gidRaw = execFileSync("id", ["-g", username], {
            encoding: "utf8",
            timeout: 2000,
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return {
            uid: parseUint(uidRaw),
            gid: parseUint(gidRaw),
        };
    } catch {
        return {};
    }
}

/**
 * Resolve sandbox identity from env (cached).
 * Call `clearSandboxIdentityCache()` in tests after env changes.
 */
export function resolveSandboxIdentity(): SandboxIdentity {
    if (cachedIdentity) return cachedIdentity;

    if (process.platform === "win32") {
        cachedIdentity = {
            enabled: false,
            reason: "uid/gid isolation is not available on Windows",
        };
        return cachedIdentity;
    }

    const explicitOff =
        process.env.ATABEY_SANDBOX_ENABLED === "false" ||
        process.env.ATABEY_SANDBOX_ENABLED === "0";
    if (explicitOff) {
        cachedIdentity = { enabled: false, reason: "ATABEY_SANDBOX_ENABLED=false" };
        return cachedIdentity;
    }

    let uid = parseUint(process.env.ATABEY_SANDBOX_UID);
    let gid = parseUint(process.env.ATABEY_SANDBOX_GID);
    const user = process.env.ATABEY_SANDBOX_USER?.trim() || undefined;

    if (user && (uid === undefined || gid === undefined)) {
        const resolved = resolveUserIds(user);
        uid = uid ?? resolved.uid;
        gid = gid ?? resolved.gid;
    }

    // Never drop privileges to root (0) — that would be a no-op or worse
    if (uid === 0) {
        cachedIdentity = {
            enabled: false,
            reason: "ATABEY_SANDBOX_UID=0 (root) is refused",
            uid,
            gid,
            user,
        };
        return cachedIdentity;
    }

    if (uid === undefined) {
        // Optional: if current process is already non-root and no sandbox user
        // configured, we leave sandbox disabled rather than inventing a user.
        cachedIdentity = {
            enabled: false,
            reason:
                "No ATABEY_SANDBOX_UID / ATABEY_SANDBOX_USER configured — shell runs as current user",
            user,
        };
        return cachedIdentity;
    }

    // Dropping privileges only works if we are root (or have CAP_SETUID).
    // If we are a normal user with a different target uid, spawn will fail —
    // detect and warn via reason, still pass options (caller sees Permission error).
    const canSetUid = typeof process.getuid === "function" && process.getuid() === 0;
    if (!canSetUid && typeof process.getuid === "function" && process.getuid() !== uid) {
        cachedIdentity = {
            enabled: false,
            uid,
            gid,
            user,
            reason:
                `Sandbox uid=${uid} requested but process uid=${process.getuid()} is not root; ` +
                `setuid will fail. Run MCP as root with a dedicated sandbox user, or unset sandbox env.`,
        };
        return cachedIdentity;
    }

    cachedIdentity = {
        enabled: true,
        uid,
        gid,
        user,
    };
    return cachedIdentity;
}

export function clearSandboxIdentityCache(): void {
    cachedIdentity = null;
}

/**
 * Build spawn options with uid/gid when sandbox is active.
 */
export function applySandboxToSpawnOptions(options: SandboxSpawnOptions = {}): SpawnOptions {
    const { disableSandbox, ...rest } = options;
    if (disableSandbox) return { ...rest };

    const identity = resolveSandboxIdentity();
    if (!identity.enabled || identity.uid === undefined) {
        return { ...rest };
    }

    return {
        ...rest,
        uid: identity.uid,
        ...(identity.gid !== undefined ? { gid: identity.gid } : {}),
    };
}

/**
 * spawn() wrapper that applies OS sandbox identity when configured.
 */
export function sandboxSpawn(
    command: string,
    args: readonly string[],
    options: SandboxSpawnOptions = {},
): ChildProcess {
    const opts = applySandboxToSpawnOptions(options);
    return spawn(command, args as string[], opts);
}

/**
 * Human-readable status for dashboard / CLI diagnostics.
 */
export function getSandboxStatus(): {
    platform: string;
    identity: SandboxIdentity;
    processUid: number | null;
    processGid: number | null;
} {
    return {
        platform: process.platform,
        identity: resolveSandboxIdentity(),
        processUid: typeof process.getuid === "function" ? process.getuid() : null,
        processGid: typeof process.getgid === "function" ? process.getgid() : null,
    };
}

/** Default restricted paths agents should not touch even with shell allow-list. */
export const SANDBOX_PROTECTED_HINTS = [
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/System",
    pathHomeDotSsh(),
] as const;

function pathHomeDotSsh(): string {
    try {
        return `${os.homedir()}/.ssh`;
    } catch {
        return "~/.ssh";
    }
}
