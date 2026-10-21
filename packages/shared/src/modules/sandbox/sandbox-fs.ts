/**
 * Sandboxed filesystem mutations — Phase 1.2.
 *
 * - Always holds AtomicFileLock (try/finally).
 * - When runtime=container: write via container stdin → /workspace/<path>
 * - When runtime=uid|none: write on host under projectRoot (safePath caller responsibility)
 * - ATABEY_SANDBOX_REQUIRED=true rejects writes if isolation is none
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AtomicFileLock } from "../concurrency/file-lock.js";
import {
    resolveSandboxRuntimeConfig,
    SandboxRequiredError,
    type SandboxRuntimeConfig,
} from "./sandbox-runtime.js";

export interface SandboxFsWriteResult {
    absolutePath: string;
    relativePath: string;
    runtime: SandboxRuntimeConfig["effectiveMode"];
    isolationLabel: string;
    bytes: number;
}

/**
 * Normalize user path to a project-relative POSIX path.
 * Absolute paths are accepted only if they resolve inside projectRoot.
 */
export function assertSafeRelativePath(userPath: string, projectRoot?: string): string {
    if (!userPath || !userPath.trim()) {
        throw new Error("[SANDBOX_FS] Empty path is not allowed");
    }
    const trimmed = userPath.trim();
    if (trimmed.includes("\0")) {
        throw new Error("[SANDBOX_FS] Illegal null byte in path");
    }

    let rel = trimmed.replace(/\\/g, "/");

    // Absolute path → must live under projectRoot
    if (path.isAbsolute(trimmed) || rel.startsWith("/")) {
        if (!projectRoot) {
            throw new Error(`[SANDBOX_FS] Absolute paths require projectRoot: "${userPath}"`);
        }
        const root = path.resolve(projectRoot);
        const abs = path.resolve(trimmed);
        const rootCheck = process.platform === "win32" ? root.toLowerCase() : root;
        const absCheck = process.platform === "win32" ? abs.toLowerCase() : abs;
        if (!absCheck.startsWith(rootCheck + path.sep) && absCheck !== rootCheck) {
            throw new Error(`[SANDBOX_FS] Absolute path escapes project root: "${userPath}"`);
        }
        rel = path.relative(root, abs).replace(/\\/g, "/");
        if (!rel || rel === ".") {
            throw new Error("[SANDBOX_FS] Path resolves to project root; refuse write");
        }
        if (rel.startsWith("..")) {
            throw new Error(`[SANDBOX_FS] Path traversal denied: "${userPath}"`);
        }
        return rel;
    }

    // Relative: reject .. segments
    const parts: string[] = [];
    for (const seg of rel.split("/")) {
        if (!seg || seg === ".") continue;
        if (seg === "..") {
            throw new Error(`[SANDBOX_FS] Path traversal denied: "${userPath}"`);
        }
        parts.push(seg);
    }
    if (parts.length === 0) {
        throw new Error("[SANDBOX_FS] Path resolves to project root; refuse write");
    }
    return parts.join("/");
}

function createLock(projectRoot: string): AtomicFileLock {
    return new AtomicFileLock({
        projectRoot,
        locksDir: path.join(projectRoot, ".atabey", "locks"),
        ttlMs: 5 * 60 * 1000,
        timeoutMs: 15_000,
    });
}

function hostWriteAtomic(absolutePath: string, content: string): void {
    const dir = path.dirname(absolutePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    // Write exact bytes (callers decide trailing newline — patch/replace need fidelity)
    const tempPath = `${absolutePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
    try {
        fs.writeFileSync(tempPath, content, "utf8");
        fs.renameSync(tempPath, absolutePath);
    } catch (err) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* ignore */ }
        throw err;
    }
}

/**
 * Reject writes whose real (symlink-resolved) path escapes the project root.
 * Lexical checks alone are defeated by a symlink inside the project that
 * points at e.g. ~/.ssh/authorized_keys.
 */
function assertRealPathInsideRoot(absolutePath: string, root: string): void {
    const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
    let probe = absolutePath;
    while (probe !== path.dirname(probe)) {
        if (fs.existsSync(probe)) {
            const real = fs.realpathSync(probe) + absolutePath.slice(probe.length);
            if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
                throw new Error(`[SANDBOX_FS] Symlink escape denied: "${absolutePath}"`);
            }
            return;
        }
        probe = path.dirname(probe);
    }
}

/**
 * Write file content under project root using the active local sandbox runtime.
 */
export async function writeFileInSandbox(
    projectRoot: string,
    userPath: string,
    content: string,
    options?: { ownerId?: string; timeoutMs?: number },
): Promise<SandboxFsWriteResult> {
    const root = path.resolve(projectRoot);
    const relativePath = assertSafeRelativePath(userPath, root);
    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(root + path.sep) && absolutePath !== root) {
        throw new Error(`[SANDBOX_FS] Resolved path escapes project root: "${userPath}"`);
    }
    assertRealPathInsideRoot(absolutePath, root);

    const cfg = resolveSandboxRuntimeConfig(root, options?.timeoutMs);
    if (cfg.required && cfg.effectiveMode === "none") {
        throw new SandboxRequiredError(
            "[SANDBOX_REQUIRED] File write blocked: no OS sandbox isolation available. " +
            "Set ATABEY_SANDBOX_RUNTIME=seatbelt or uid, or disable ATABEY_SANDBOX_REQUIRED.",
        );
    }

    const owner = options?.ownerId || process.env.ATABEY_ACTIVE_AGENT || "mcp-writer";
    const lock = createLock(root);

    return lock.withLock(relativePath, owner, async () => {
        hostWriteAtomic(absolutePath, content);
        return {
            absolutePath,
            relativePath,
            runtime: cfg.effectiveMode,
            isolationLabel:
                cfg.effectiveMode === "seatbelt"
                    ? "seatbelt host write (project-bound)"
                    : cfg.effectiveMode === "uid"
                        ? "uid host write (project-bound)"
                        : "host write (project-bound)",
            bytes: Buffer.byteLength(content, "utf8"),
        };
    });
}

