/**
 * [LOCK] Multi-user Distributed Lock Mechanism
 *
 * Git-based lock system. Enables team members to work on the same
 * files/resources without conflicts.
 *
 * Usage:
 *   const lock = new DistributedLock("database/schema.sql");
 *   if (lock.acquire("user-123", 60000)) {
 *     // Apply changes
 *     lock.release("user-123");
 *   }
 */

import { execSync } from "child_process";
import os from "os";
import { Storage } from "./storage.js";

export type LockStatus = "LOCKED" | "AVAILABLE" | "STALE" | "EXPIRED";

export interface LockInfo {
    resource: string;
    ownerId: string;
    ownerName: string;
    acquiredAt: string;
    expiresAt: string;
    reason: string;
    traceId?: string;
}

export class DistributedLock {
    private static TABLE = "distributed_locks";

    /**
     * Initialize the locks table (run once at startup).
     */
    public static initialize(): void {
        const db = Storage.getDB();
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.TABLE} (
                resource TEXT PRIMARY KEY,
                ownerId TEXT NOT NULL,
                ownerName TEXT NOT NULL,
                acquiredAt TEXT NOT NULL,
                expiresAt TEXT NOT NULL,
                reason TEXT,
                traceId TEXT
            )
        `);
    }

    /**
     * Attempts to acquire a lock on a resource.
     *
     * @param resource - Lock resource name (e.g., "apps/backend/src/types/user.ts")
     * @param ownerId - Unique owner identifier (e.g., "yusuf", "ci-bot-01")
     * @param options - Optional parameters
     * @returns true if lock acquired, false if already locked
     */
    public static acquire(
        resource: string,
        ownerId: string,
        options: {
            ownerName?: string;
            ttlMs?: number;
            reason?: string;
            traceId?: string;
            force?: boolean;
        } = {}
    ): boolean {
        const db = Storage.getDB();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (options.ttlMs || 60000)).toISOString();
        const ownerName = options.ownerName || ownerId;
        const reason = options.reason || "No reason provided";

        // Clean up stale locks first
        this.releaseStaleLocks();

        // If force=true, override existing lock directly using INSERT OR REPLACE
        if (options.force) {
            db.prepare(`
                INSERT OR REPLACE INTO ${this.TABLE} (resource, ownerId, ownerName, acquiredAt, expiresAt, reason, traceId)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(resource, ownerId, ownerName, now.toISOString(), expiresAt, reason, options.traceId || null);
            return true;
        }

        // Acquire new lock atomically using INSERT OR IGNORE.
        // If the resource is already locked, changes will be 0.
        const result = db.prepare(`
            INSERT OR IGNORE INTO ${this.TABLE} (resource, ownerId, ownerName, acquiredAt, expiresAt, reason, traceId)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(resource, ownerId, ownerName, now.toISOString(), expiresAt, reason, options.traceId || null);

        return result.changes > 0;
    }

    /**
     * Releases a lock. Only the lock owner can release.
     *
     * @param resource - Lock resource name
     * @param ownerId - Owner identifier for verification
     * @returns true if released successfully
     */
    public static release(resource: string, ownerId: string): boolean {
        const db = Storage.getDB();
        const result = db.prepare(
            `DELETE FROM ${this.TABLE} WHERE resource = ? AND ownerId = ?`
        ).run(resource, ownerId);

        return result.changes > 0;
    }

    /**
     * Checks if a resource is locked.
     */
    public static isLocked(resource: string): boolean {
        const db = Storage.getDB();
        const lock = db.prepare(
            `SELECT * FROM ${this.TABLE} WHERE resource = ? AND expiresAt > datetime('now')`
        ).get(resource) as LockInfo | undefined;

        return !!lock;
    }

    /**
     * Gets lock information for a resource.
     */
    public static getLock(resource: string): LockInfo | null {
        const db = Storage.getDB();
        this.releaseStaleLocks();
        const lock = db.prepare(
            `SELECT * FROM ${this.TABLE} WHERE resource = ?`
        ).get(resource) as LockInfo | undefined;

        return lock || null;
    }

    /**
     * Lists all active locks.
     */
    public static listActiveLocks(): LockInfo[] {
        const db = Storage.getDB();
        this.releaseStaleLocks();
        return db.prepare(
            `SELECT * FROM ${this.TABLE} WHERE expiresAt > datetime('now') ORDER BY acquiredAt DESC`
        ).all() as LockInfo[];
    }

    /**
     * Lists all locks owned by a specific owner.
     */
    public static listOwnerLocks(ownerId: string): LockInfo[] {
        const db = Storage.getDB();
        return db.prepare(
            `SELECT * FROM ${this.TABLE} WHERE ownerId = ? ORDER BY acquiredAt DESC`
        ).all(ownerId) as LockInfo[];
    }

    /**
     * Releases all locks owned by a specific owner (e.g., on disconnect).
     */
    public static releaseAllByOwner(ownerId: string): number {
        const db = Storage.getDB();
        const result = db.prepare(
            `DELETE FROM ${this.TABLE} WHERE ownerId = ?`
        ).run(ownerId);

        return result.changes;
    }

    /**
     * Releases all expired/stale locks.
     */
    private static releaseStaleLocks(): number {
        const db = Storage.getDB();
        const result = db.prepare(
            `DELETE FROM ${this.TABLE} WHERE expiresAt < datetime('now')`
        ).run();

        return result.changes;
    }

    /**
     * Generates a unique owner ID for the current user/machine.
     * Uses git config user.name or hostname as fallback.
     */
    public static getLocalOwnerId(): string {
        // Try git config
        try {
            const name = execSync("git config user.name", { encoding: "utf8" }).trim();
            if (name) return name;
        } catch {
            // Fallback
        }

        // Try environment
        if (process.env.USER) return process.env.USER;
        if (process.env.USERNAME) return process.env.USERNAME;

        // Fallback to hostname
        try {
            return os.hostname();
        } catch {
            return "unknown-user";
        }
    }
}
