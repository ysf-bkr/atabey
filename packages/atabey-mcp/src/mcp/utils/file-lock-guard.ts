/**
 * File mutation helper — exclusive lock + sandboxed write (Phase 1.2).
 */

import path from "path";
import {
    writeFileInSandbox,
    type SandboxFsWriteResult,
} from "atabey-shared/sandbox-fs.js";
import { AtomicFileLock } from "atabey-shared/file-lock.js";
import { resolveActiveAgent } from "./permissions.js";
import { resolveFrameworkDir } from "./security.js";

function resolveAgent(projectRoot: string): string {
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir)
        ? frameworkDir
        : path.resolve(projectRoot, frameworkDir);
    const active = resolveActiveAgent(absoluteFrameworkPath);
    if (active) return active.startsWith("@") ? active : `@${active}`;
    return process.env.ATABEY_ACTIVE_AGENT?.trim() || "mcp-client";
}

function createLock(projectRoot: string): AtomicFileLock {
    return new AtomicFileLock({
        projectRoot,
        locksDir: path.join(projectRoot, ".atabey", "locks"),
        ttlMs: 5 * 60 * 1000,
        timeoutMs: 15_000,
    });
}

/**
 * Run a callback under exclusive lock (for multi-step read-modify-write on host).
 * Prefer writeProjectFile() for simple content writes (uses container when configured).
 */
export async function withProjectFileLock<T>(
    projectRoot: string,
    relativePath: string,
    fn: () => Promise<T> | T,
): Promise<T> {
    const lock = createLock(projectRoot);
    const owner = resolveAgent(projectRoot);
    return lock.withLock(relativePath, owner, fn, {
        reason: "mcp file mutation",
        timeoutMs: 15_000,
    });
}

/**
 * Write file content via sandbox runtime (container/uid/host) under exclusive lock.
 */
export async function writeProjectFile(
    projectRoot: string,
    relativePath: string,
    content: string,
): Promise<SandboxFsWriteResult> {
    return writeFileInSandbox(projectRoot, relativePath, content, {
        ownerId: resolveAgent(projectRoot),
    });
}
