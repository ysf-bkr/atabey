import path from "path";
import { AtomicFileLock } from "atabey-shared/file-lock.js";
import { ToolResult, AcquireLockArgs, ReleaseLockArgs } from "../types.js";
import { resolveFrameworkDir } from "atabey-mcp/utils/security.js";

/**
 * Acquire/release resource locks under `.atabey/locks` via atomic wx create.
 * Shared implementation: AtomicFileLock (no check-then-act race).
 */
function createLocker(projectRoot: string): AtomicFileLock {
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const locksDir = path.isAbsolute(frameworkDir)
        ? path.join(frameworkDir, "locks")
        : path.join(projectRoot, frameworkDir, "locks");

    return new AtomicFileLock({
        projectRoot,
        locksDir,
        // args.ttl is seconds in the MCP tool schema
        ttlMs: 5 * 60 * 1000,
    });
}

/**
 * Handles acquiring a stateful lock on a resource with Deadlock Resolution.
 */
export async function handleAcquireLock(projectRoot: string, args: AcquireLockArgs): Promise<ToolResult> {
    const { resource, agent, ttl = 300 } = args; // Default TTL 5 minutes
    const lock = new AtomicFileLock({
        projectRoot,
        locksDir: (() => {
            const frameworkDir = resolveFrameworkDir(projectRoot);
            return path.isAbsolute(frameworkDir)
                ? path.join(frameworkDir, "locks")
                : path.join(projectRoot, frameworkDir, "locks");
        })(),
        ttlMs: Math.max(1, ttl) * 1000,
    });

    try {
        const result = lock.tryAcquire(resource, agent, "mcp acquire_lock");
        if (!result.acquired) {
            const holder = result.heldBy?.ownerId ?? "another agent";
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `[LOCKED] Resource '${resource}' is currently locked by ${holder}. Try again later.`,
                }],
            };
        }

        return {
            content: [{ type: "text", text: `[OK] Lock acquired for resource '${resource}' by ${agent}.` }],
        };
    } catch (e) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to acquire lock: ${String(e)}` }],
        };
    }
}

/**
 * Handles releasing a lock.
 */
export async function handleReleaseLock(projectRoot: string, args: ReleaseLockArgs): Promise<ToolResult> {
    const { resource, agent } = args;
    const lock = createLocker(projectRoot);

    try {
        const held = lock.isLocked(resource);
        if (!held) {
            return { content: [{ type: "text", text: `[INFO] No lock found for resource '${resource}'.` }] };
        }

        const released = lock.release(resource, agent);
        if (!released) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `[ERROR] Denied: You do not own the lock for '${resource}'. Owned by ${held.ownerId}.`,
                }],
            };
        }

        return {
            content: [{ type: "text", text: `[OK] Lock released for resource '${resource}' by ${agent}.` }],
        };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Failed to release lock: ${String(e)}` }] };
    }
}
