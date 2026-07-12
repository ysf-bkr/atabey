import fs from "fs";
import path from "path";
import { AtomicFileLock, type FileLockMeta } from "atabey-shared/file-lock.js";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

/**
 * [ENGINE] File Lock — Conflict Resolution for Multi-Agent File Access
 *
 * Prevents two agents from writing to the same file simultaneously.
 * Uses atomic exclusive create (`fs.openSync(path, "wx")`) under `.atabey/locks/`.
 *
 * Flow:
 * 1. Agent A acquires lock on src/file.ts → exclusive .lock file created
 * 2. Agent B tries same path → EEXIST → WAITING / false
 * 3. Agent A releases → unlink → Agent B can proceed
 *
 * Stale lock detection: locks older than TTL (default 5 min) are reclaimed.
 */
export class FileLock {
    private static STALE_TIMEOUT_MS = 5 * 60 * 1000;

    /** Prefer ATABEY_PROJECT_ROOT (MCP) over process.cwd(). */
    private static projectRoot(): string {
        return process.env.ATABEY_PROJECT_ROOT || process.cwd();
    }

    private static locksDir(): string {
        return path.join(FileLock.projectRoot(), ".atabey", "locks");
    }

    private static locker(): AtomicFileLock {
        const projectRoot = FileLock.projectRoot();
        return new AtomicFileLock({
            projectRoot,
            locksDir: FileLock.locksDir(),
            ttlMs: FileLock.STALE_TIMEOUT_MS,
        });
    }

    /**
     * Attempts to acquire a lock for a file on behalf of an agent.
     * Returns true if lock acquired, false if another agent holds it.
     */
    public static acquire(agentName: string, filePath: string): boolean {
        const lock = FileLock.locker();
        const result = lock.tryAcquire(filePath, agentName, "multi-agent file write");

        if (result.acquired) {
            logger.debug(`[FILE_LOCK] ${agentName} acquired lock on ${filePath}`);
            return true;
        }

        const heldBy = result.heldBy?.ownerId ?? "unknown";
        logger.warn(`[FILE_LOCK] CONFLICT: ${agentName} cannot write ${filePath} — locked by ${heldBy}`);
        AtabeyStorage.saveLog({
            agent: agentName,
            action: "FILE_LOCK_CONFLICT",
            trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
            status: "BLOCKED",
            summary: `File ${filePath} is locked by ${heldBy}. Waiting for release.`,
        });
        return false;
    }

    /**
     * Async acquire with retry until timeout (default 10s).
     */
    public static async acquireAsync(
        agentName: string,
        filePath: string,
        timeoutMs = 10_000,
    ): Promise<boolean> {
        const lock = FileLock.locker();
        try {
            await lock.acquireAsync(filePath, agentName, {
                reason: "multi-agent file write",
                timeoutMs,
            });
            logger.debug(`[FILE_LOCK] ${agentName} acquired lock (async) on ${filePath}`);
            return true;
        } catch (err) {
            logger.warn(`[FILE_LOCK] ${agentName} timed out waiting for ${filePath}: ${(err as Error).message}`);
            AtabeyStorage.saveLog({
                agent: agentName,
                action: "FILE_LOCK_TIMEOUT",
                trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
                status: "BLOCKED",
                summary: (err as Error).message,
            });
            return false;
        }
    }

    /**
     * Releases a lock held by an agent.
     * Only the lock-owning agent can release (others get warning).
     */
    public static release(agentName: string, filePath: string): boolean {
        const lock = FileLock.locker();
        const released = lock.release(filePath, agentName);
        if (!released) {
            const held = lock.isLocked(filePath);
            if (held) {
                logger.warn(
                    `[FILE_LOCK] ${agentName} tried to release lock held by ${held.ownerId} on ${filePath}`,
                );
            }
            return false;
        }
        logger.debug(`[FILE_LOCK] ${agentName} released lock on ${filePath}`);
        return true;
    }

    /**
     * Checks if a file is currently locked.
     * Returns the locking agent name or null.
     */
    public static isLocked(filePath: string): string | null {
        const meta = FileLock.locker().isLocked(filePath);
        return meta?.ownerId ?? null;
    }

    /**
     * Run fn while holding an exclusive lock on filePath.
     */
    public static async withLock<T>(
        agentName: string,
        filePath: string,
        fn: () => Promise<T> | T,
        timeoutMs = 10_000,
    ): Promise<T> {
        return FileLock.locker().withLock(filePath, agentName, fn, {
            reason: "multi-agent file write",
            timeoutMs,
        });
    }

    /**
     * Lists all currently active locks under `.atabey/locks`.
     */
    public static listLocks(): Array<{ agent: string; file: string; acquiredAt: string }> {
        const locksDir = FileLock.locksDir();
        if (!fs.existsSync(locksDir)) return [];

        const locks: Array<{ agent: string; file: string; acquiredAt: string }> = [];

        const walkDir = (dir: string) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walkDir(fullPath);
                } else if (entry.name.endsWith(".lock")) {
                    try {
                        const data = JSON.parse(fs.readFileSync(fullPath, "utf8")) as FileLockMeta;
                        const exp = Date.parse(data.expiresAt);
                        if (!Number.isNaN(exp) && Date.now() > exp) {
                            try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
                            continue;
                        }
                        locks.push({
                            agent: data.ownerId,
                            file: data.resource,
                            acquiredAt: data.acquiredAt,
                        });
                    } catch {
                        try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
                    }
                }
            }
        };

        walkDir(locksDir);
        return locks;
    }
}
