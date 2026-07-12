/**
 * Atomic File-Based Locking — OS-level exclusive create via open('wx').
 *
 * Replaces check-then-act lock races. No Redis/Redlock required.
 *
 * Pattern:
 *   resource  →  .atabey/locks/<relative>.lock  (created with O_EXCL / 'wx')
 *   holder writes JSON metadata after exclusive create
 *   release unlinks the lock file
 *
 * Stale locks (TTL exceeded) are reclaimed atomically when possible.
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface FileLockOptions {
    /** Base directory for lock files. Default: `.atabey/locks` under cwd or projectRoot. */
    locksDir?: string;
    /** Project root used to relativize resource paths. Default: process.cwd(). */
    projectRoot?: string;
    /** Lock TTL in ms. Stale locks may be stolen after this. Default: 5 minutes. */
    ttlMs?: number;
    /** Retry interval when waiting for a lock. Default: 50ms. */
    retryMs?: number;
    /** Max wait when using acquireAsync. Default: 10s. */
    timeoutMs?: number;
}

export interface FileLockMeta {
    ownerId: string;
    resource: string;
    acquiredAt: string;
    expiresAt: string;
    reason?: string;
    pid: number;
    hostname: string;
}

export class AtomicFileLock {
    private readonly locksDir: string;
    private readonly projectRoot: string;
    private readonly ttlMs: number;
    private readonly retryMs: number;
    private readonly timeoutMs: number;

    constructor(options: FileLockOptions = {}) {
        this.projectRoot = options.projectRoot ?? process.cwd();
        this.locksDir = options.locksDir
            ? path.resolve(options.locksDir)
            : path.join(this.projectRoot, ".atabey", "locks");
        this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
        this.retryMs = options.retryMs ?? 50;
        this.timeoutMs = options.timeoutMs ?? 10_000;
    }

    /** Absolute path of the lock file for a resource. */
    public getLockPath(resource: string): string {
        const abs = path.isAbsolute(resource)
            ? resource
            : path.resolve(this.projectRoot, resource);
        let relative = path.relative(this.projectRoot, abs);
        if (relative.startsWith("..")) {
            // Outside project root — hash path to avoid escaping locks dir
            relative = `_ext/${Buffer.from(abs).toString("base64url")}`;
        }
        // Normalize separators for cross-platform lock paths
        relative = relative.split(path.sep).join("/");
        return path.join(this.locksDir, `${relative}.lock`);
    }

    /**
     * Try to acquire a lock once (non-blocking).
     * Uses atomic exclusive file create (`wx` = O_CREAT | O_EXCL | O_WRONLY).
     */
    public tryAcquire(
        resource: string,
        ownerId: string,
        reason?: string,
        _reclaimDepth = 0,
    ): { acquired: boolean; meta?: FileLockMeta; heldBy?: FileLockMeta } {
        const lockPath = this.getLockPath(resource);
        fs.mkdirSync(path.dirname(lockPath), { recursive: true });

        // Reclaim stale lock first (best-effort, still atomic on create)
        this.reclaimIfStale(lockPath);

        const now = Date.now();
        const meta: FileLockMeta = {
            ownerId,
            resource,
            acquiredAt: new Date(now).toISOString(),
            expiresAt: new Date(now + this.ttlMs).toISOString(),
            reason,
            pid: process.pid,
            hostname: os.hostname(),
        };

        let fd: number | undefined;
        try {
            // Atomic exclusive create — fails if file already exists
            fd = fs.openSync(lockPath, "wx");
            try {
                fs.writeFileSync(fd, JSON.stringify(meta, null, 2), "utf8");
            } catch (writeErr) {
                // CRITICAL: meta write failed after wx create (e.g. ENOSPC) — remove orphan lock
                try {
                    if (fd !== undefined) fs.closeSync(fd);
                } catch { /* ignore */ }
                fd = undefined;
                this.forceRemove(lockPath, null);
                throw writeErr;
            }
            fs.closeSync(fd);
            fd = undefined;
            return { acquired: true, meta };
        } catch (err) {
            if (fd !== undefined) {
                try { fs.closeSync(fd); } catch { /* ignore */ }
            }
            const code = (err as NodeJS.ErrnoException).code;
            if (code === "EEXIST") {
                // Race: another process created the lock between reclaim and open
                const heldBy = this.readMeta(lockPath) ?? undefined;
                // Corrupt lock (unreadable JSON) or expired → reclaim and retry once
                if ((!heldBy || this.isExpired(heldBy)) && _reclaimDepth < 1) {
                    this.forceRemove(lockPath, heldBy ?? null);
                    return this.tryAcquire(resource, ownerId, reason, _reclaimDepth + 1);
                }
                return { acquired: false, heldBy };
            }
            throw err;
        }
    }

    /**
     * Acquire with async retry until timeout.
     */
    public async acquireAsync(
        resource: string,
        ownerId: string,
        options?: { reason?: string; timeoutMs?: number; retryMs?: number },
    ): Promise<FileLockMeta> {
        const timeoutMs = options?.timeoutMs ?? this.timeoutMs;
        const retryMs = options?.retryMs ?? this.retryMs;
        const start = Date.now();

        while (true) {
            const result = this.tryAcquire(resource, ownerId, options?.reason);
            if (result.acquired && result.meta) {
                return result.meta;
            }
            if (Date.now() - start >= timeoutMs) {
                const holder = result.heldBy?.ownerId ?? "unknown";
                throw new Error(
                    `[AtomicFileLock] Timeout acquiring lock for "${resource}" after ${timeoutMs}ms (held by ${holder})`,
                );
            }
            await sleep(retryMs);
        }
    }

    /**
     * Release lock only if owned by ownerId (or force=true).
     */
    public release(resource: string, ownerId: string, force = false): boolean {
        const lockPath = this.getLockPath(resource);
        if (!fs.existsSync(lockPath)) return true;

        const meta = this.readMeta(lockPath);
        if (!meta) {
            this.forceRemove(lockPath, null);
            return true;
        }
        if (!force && meta.ownerId !== ownerId) {
            return false;
        }
        this.forceRemove(lockPath, meta);
        return true;
    }

    public isLocked(resource: string): FileLockMeta | null {
        const lockPath = this.getLockPath(resource);
        if (!fs.existsSync(lockPath)) return null;
        const meta = this.readMeta(lockPath);
        if (!meta) return null;
        if (this.isExpired(meta)) {
            this.forceRemove(lockPath, meta);
            return null;
        }
        return meta;
    }

    /**
     * Run `fn` while holding the lock.
     * ALWAYS releases in `finally` even if `fn` throws (disk full, parse errors, etc.).
     */
    public async withLock<T>(
        resource: string,
        ownerId: string,
        fn: () => Promise<T> | T,
        options?: { reason?: string; timeoutMs?: number },
    ): Promise<T> {
        await this.acquireAsync(resource, ownerId, options);
        try {
            return await fn();
        } finally {
            try {
                this.release(resource, ownerId);
            } catch {
                this.forceRemove(this.getLockPath(resource), null);
            }
            const stillHeld = this.isLocked(resource);
            if (stillHeld && stillHeld.ownerId === ownerId) {
                this.forceRemove(this.getLockPath(resource), stillHeld);
            }
        }
    }

    /**
     * Synchronous withLock — same try/finally release guarantee.
     */
    public withLockSync<T>(
        resource: string,
        ownerId: string,
        fn: () => T,
        options?: { reason?: string },
    ): T {
        const result = this.tryAcquire(resource, ownerId, options?.reason);
        if (!result.acquired) {
            const holder = result.heldBy?.ownerId ?? "unknown";
            throw new Error(
                `[AtomicFileLock] Could not acquire lock for "${resource}" (held by ${holder})`,
            );
        }
        try {
            return fn();
        } finally {
            try {
                this.release(resource, ownerId);
            } catch {
                this.forceRemove(this.getLockPath(resource), null);
            }
            const stillHeld = this.isLocked(resource);
            if (stillHeld && stillHeld.ownerId === ownerId) {
                this.forceRemove(this.getLockPath(resource), stillHeld);
            }
        }
    }

    private reclaimIfStale(lockPath: string): void {
        if (!fs.existsSync(lockPath)) return;
        const meta = this.readMeta(lockPath);
        if (!meta || this.isExpired(meta)) {
            this.forceRemove(lockPath, meta);
        }
    }

    private isExpired(meta: FileLockMeta): boolean {
        const exp = Date.parse(meta.expiresAt);
        if (Number.isNaN(exp)) {
            // Fallback: acquiredAt + ttl
            const acq = Date.parse(meta.acquiredAt);
            return Number.isNaN(acq) ? true : Date.now() - acq > this.ttlMs;
        }
        return Date.now() > exp;
    }

    private readMeta(lockPath: string): FileLockMeta | null {
        try {
            const raw = fs.readFileSync(lockPath, "utf8");
            return JSON.parse(raw) as FileLockMeta;
        } catch {
            return null;
        }
    }

    private forceRemove(lockPath: string, _meta: FileLockMeta | null): void {
        try {
            fs.unlinkSync(lockPath);
        } catch {
            // ignore ENOENT races
        }
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

/** Convenience: lock under project `.atabey/locks`. */
export function createProjectFileLock(projectRoot: string, options?: Omit<FileLockOptions, "projectRoot">): AtomicFileLock {
    return new AtomicFileLock({ ...options, projectRoot });
}
