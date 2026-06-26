import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

/**
 * [ENGINE] File Lock — Conflict Resolution for Multi-Agent File Access
 *
 * Prevents two agents from writing to the same file simultaneously.
 * Uses .atabey/locks/ directory with per-file lock files.
 *
 * Flow:
 * 1. Agent A acquires lock on src/file.ts → writes .atabey/locks/src/file.ts.lock
 * 2. Agent B tries to write src/file.ts → lock exists → WAITING state
 * 3. Agent A releases lock → Agent B can proceed
 *
 * Stale lock detection: locks older than 5 minutes are auto-released.
 */
export class FileLock {
    private static LOCKS_DIR = ".atabey/locks";
    private static STALE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Attempts to acquire a lock for a file on behalf of an agent.
     * Returns true if lock acquired, false if another agent holds it.
     */
    public static acquire(agentName: string, filePath: string): boolean {
        const lockFile = FileLock.getLockPath(filePath);
        const lockDir = path.dirname(lockFile);

        // Ensure locks directory exists
        if (!fs.existsSync(lockDir)) {
            fs.mkdirSync(lockDir, { recursive: true });
        }

        // Check if lock already exists
        if (fs.existsSync(lockFile)) {
            try {
                const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));

                // Check if lock is stale (older than 5 min)
                const lockAge = Date.now() - new Date(lockData.acquiredAt).getTime();
                if (lockAge > FileLock.STALE_TIMEOUT_MS) {
                    logger.warn(`[FILE_LOCK] Stale lock detected for ${filePath} (age: ${Math.round(lockAge / 1000)}s). Overriding.`);
                    fs.unlinkSync(lockFile);
                } else {
                    // Lock is held by another agent — conflict
                    logger.warn(`[FILE_LOCK] CONFLICT: ${agentName} cannot write ${filePath} — locked by ${lockData.agent}`);
                    AtabeyStorage.saveLog({
                        agent: agentName,
                        action: "FILE_LOCK_CONFLICT",
                        trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
                        status: "BLOCKED",
                        summary: `File ${filePath} is locked by ${lockData.agent}. Waiting for release.`
                    });
                    return false;
                }
            } catch {
                // Corrupted lock file — remove and retry
                fs.unlinkSync(lockFile);
            }
        }

        // Acquire lock
        fs.writeFileSync(lockFile, JSON.stringify({
            agent: agentName,
            file: filePath,
            acquiredAt: new Date().toISOString(),
            traceId: AtabeyStorage.getMetadata("traceId") || "N/A"
        }, null, 2));

        logger.debug(`[FILE_LOCK] ${agentName} acquired lock on ${filePath}`);
        return true;
    }

    /**
     * Releases a lock held by an agent.
     * Only the lock-owning agent can release (others get warning).
     */
    public static release(agentName: string, filePath: string): boolean {
        const lockFile = FileLock.getLockPath(filePath);

        if (!fs.existsSync(lockFile)) {
            return true; // No lock to release
        }

        try {
            const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));
            if (lockData.agent !== agentName) {
                logger.warn(`[FILE_LOCK] ${agentName} tried to release lock held by ${lockData.agent} on ${filePath}`);
                return false;
            }

            fs.unlinkSync(lockFile);
            logger.debug(`[FILE_LOCK] ${agentName} released lock on ${filePath}`);
            return true;
        } catch {
            // Corrupted lock file — just remove it
            try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
            return true;
        }
    }

    /**
     * Checks if a file is currently locked.
     * Returns the locking agent name or null.
     */
    public static isLocked(filePath: string): string | null {
        const lockFile = FileLock.getLockPath(filePath);
        if (!fs.existsSync(lockFile)) return null;

        try {
            const lockData = JSON.parse(fs.readFileSync(lockFile, "utf8"));

            // Check for stale lock
            const lockAge = Date.now() - new Date(lockData.acquiredAt).getTime();
            if (lockAge > FileLock.STALE_TIMEOUT_MS) {
                fs.unlinkSync(lockFile);
                return null;
            }

            return lockData.agent;
        } catch {
            try { fs.unlinkSync(lockFile); } catch { /* ignore */ }
            return null;
        }
    }

    /**
     * Lists all currently active locks.
     */
    public static listLocks(): Array<{ agent: string; file: string; acquiredAt: string }> {
        const locksDir = path.join(process.cwd(), FileLock.LOCKS_DIR);
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
                        const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
                        const lockAge = Date.now() - new Date(data.acquiredAt).getTime();
                        if (lockAge <= FileLock.STALE_TIMEOUT_MS) {
                            locks.push(data);
                        } else {
                            fs.unlinkSync(fullPath); // Clean stale
                        }
                    } catch {
                        try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
                    }
                }
            }
        };

        walkDir(locksDir);
        return locks;
    }

    private static getLockPath(filePath: string): string {
        // Convert absolute/relative path to lock file path
        const relativePath = path.relative(process.cwd(), filePath).replace(/^\.\.\//, "");
        return path.join(process.cwd(), FileLock.LOCKS_DIR, `${relativePath}.lock`);
    }
}
