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
import { AtomicFileLock } from "./file-lock.js";
import {
    resolveSandboxRuntimeConfig,
    runInSandbox,
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
        if (!abs.startsWith(root + path.sep) && abs !== root) {
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

function shellSingleQuote(s: string): string {
    // Safe for sh single-quoted strings
    return `'${s.replace(/'/g, `'\\''`)}'`;
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
    const tempPath = `${absolutePath}.${Math.random().toString(36).slice(2, 9)}.tmp`;
    try {
        fs.writeFileSync(tempPath, content, "utf8");
        fs.renameSync(tempPath, absolutePath);
    } catch (err) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* ignore */ }
        throw err;
    }
}

/**
 * Write file content under project root using the active sandbox runtime.
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
    // Belt-and-suspenders: stay inside root
    if (!absolutePath.startsWith(root + path.sep) && absolutePath !== root) {
        throw new Error(`[SANDBOX_FS] Resolved path escapes project root: "${userPath}"`);
    }

    const cfg = resolveSandboxRuntimeConfig(root, options?.timeoutMs);
    if (cfg.required && cfg.effectiveMode === "none") {
        throw new SandboxRequiredError(
            "[SANDBOX_REQUIRED] File write blocked: no sandbox isolation available. " +
            "Set ATABEY_SANDBOX_RUNTIME=container (Podman/Docker) or uid, or disable ATABEY_SANDBOX_REQUIRED.",
        );
    }

    const owner = options?.ownerId || process.env.ATABEY_ACTIVE_AGENT || "mcp-writer";
    const lock = createLock(root);
    const posixRel = relativePath.split(path.sep).join("/");

    return lock.withLock(relativePath, owner, async () => {
        if (cfg.effectiveMode === "container" && cfg.engine !== "none") {
            const dir = path.posix.dirname(posixRel);
            const script =
                dir === "."
                    ? `cat > ${shellSingleQuote(posixRel)}`
                    : `mkdir -p ${shellSingleQuote(dir)} && cat > ${shellSingleQuote(posixRel)}`;

            const result = await runInSandbox({
                command: "sh",
                args: ["-c", script],
                projectRoot: root,
                timeoutMs: options?.timeoutMs ?? cfg.timeoutMs,
                stdin: content,
            });

            if (result.code !== 0) {
                throw new Error(
                    `[SANDBOX_FS] Container write failed (code ${result.code}): ${result.stderr || result.stdout}`.trim(),
                );
            }

            return {
                absolutePath,
                relativePath,
                runtime: "container",
                isolationLabel: result.isolationLabel,
                bytes: Buffer.byteLength(content, "utf8"),
            };
        }

        // uid | none — host write confined to project root
        hostWriteAtomic(absolutePath, content);
        return {
            absolutePath,
            relativePath,
            runtime: cfg.effectiveMode,
            isolationLabel:
                cfg.effectiveMode === "uid"
                    ? "uid host write (project-bound)"
                    : "host write (project-bound)",
            bytes: Buffer.byteLength(content, "utf8"),
        };
    });
}
