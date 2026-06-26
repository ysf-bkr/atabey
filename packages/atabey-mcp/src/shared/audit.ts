/**
 * [AUDIT] Structured Audit Log Service
 *
 * Records all critical operations in structured JSON format to SQLite.
 * Queryable, filterable, and traceable.
 *
 * [KVKK/GDPR] GDPR and KVKK Art. 4, 5, 11, 12 compliant:
 * - Sensitive data automatically masked (PII masking)
 * - Data retention limited (TTL)
 * - Data subject rights supported (erasure, query)
 *
 * Usage:
 *   Audit.log("user.create", "SUCCESS", { userId: "usr_123" });
 *   Audit.query({ action: "user.create", status: "FAILED" });
 */

import { maskObject, maskText } from "./pii.js";
import { Storage } from "./storage.js";
import { logger } from "./logger.js";

export type AuditStatus = "SUCCESS" | "FAILED" | "BLOCKED" | "APPROVED" | "REJECTED";

export type DataCategory = "OPERATIONAL" | "USER_DATA" | "API_CALL" | "SECURITY" | "COMPLIANCE";

export interface AuditEntry {
    id?: number;
    timestamp: string;
    action: string;
    status: AuditStatus;
    agent: string;
    traceId?: string;
    details?: Record<string, unknown>;
    errorMessage?: string;
    durationMs?: number;
    dataCategory?: DataCategory;
    /** [KVKK] Data retention period (days). null = unlimited (not recommended) */
    retentionDays?: number;
}

export class Audit {
    private static TABLE = "audit_log";
    /** [KVKK] Default data retention period: 30 days */
    private static DEFAULT_RETENTION_DAYS = parseInt(process.env.ATABEY_DATA_RETENTION_DAYS || "30", 10);
    /** [KVKK] Maximum retention for sensitive categories: 90 days */
    private static MAX_RETENTION_DAYS = 90;

    public static initialize(): void {
        const db = Storage.getDB();
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.TABLE} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                action TEXT NOT NULL,
                status TEXT NOT NULL,
                agent TEXT NOT NULL,
                traceId TEXT,
                details TEXT,
                errorMessage TEXT,
                durationMs INTEGER,
                dataCategory TEXT DEFAULT 'OPERATIONAL',
                retentionDays INTEGER DEFAULT ${this.DEFAULT_RETENTION_DAYS}
            )
        `);
        // Indexes for performance
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_audit_action ON ${this.TABLE}(action);
            CREATE INDEX IF NOT EXISTS idx_audit_status ON ${this.TABLE}(status);
            CREATE INDEX IF NOT EXISTS idx_audit_trace ON ${this.TABLE}(traceId);
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON ${this.TABLE}(timestamp);
            CREATE INDEX IF NOT EXISTS idx_audit_category ON ${this.TABLE}(dataCategory);
        `);
    }

    /**
     * Logs a structured audit entry.
     * [KVKK] Sensitive data is automatically masked.
     */
    public static log(
        action: string,
        status: AuditStatus,
        options: {
            agent?: string;
            traceId?: string;
            details?: Record<string, unknown>;
            errorMessage?: string;
            durationMs?: number;
            dataCategory?: DataCategory;
            /** [KVKK] Custom retention period (days). Default: 30 */
            retentionDays?: number;
        } = {}
    ): void {
        const db = Storage.getDB();
        const retentionDays = Math.min(
            options.retentionDays || this.DEFAULT_RETENTION_DAYS,
            this.MAX_RETENTION_DAYS
        );

        // [KVKK] PII Masking — mask sensitive data in the details field
        const maskedDetails = options.details
            ? maskObject(options.details) as Record<string, unknown>
            : undefined;
        const maskedError = options.errorMessage
            ? maskText(options.errorMessage)
            : undefined;

        const entry: Omit<AuditEntry, "id"> = {
            timestamp: new Date().toISOString(),
            action,
            status,
            agent: options.agent || "@manager",
            traceId: options.traceId,
            details: maskedDetails,
            errorMessage: maskedError,
            durationMs: options.durationMs,
            dataCategory: options.dataCategory || "OPERATIONAL",
            retentionDays,
        };

        db.prepare(`
            INSERT INTO ${this.TABLE}
                (timestamp, action, status, agent, traceId, details, errorMessage, durationMs, dataCategory, retentionDays)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            entry.timestamp,
            entry.action,
            entry.status,
            entry.agent,
            entry.traceId || null,
            entry.details ? JSON.stringify(entry.details) : null,
            entry.errorMessage || null,
            entry.durationMs || null,
            entry.dataCategory,
            entry.retentionDays,
        );
    }

    /**
     * Queries audit logs with filters.
     */
    public static query(options: {
        action?: string;
        status?: AuditStatus;
        agent?: string;
        traceId?: string;
        dataCategory?: DataCategory;
        limit?: number;
        offset?: number;
        since?: string;
        until?: string;
    } = {}): AuditEntry[] {
        const db = Storage.getDB();
        const conditions: string[] = [];
        const params: string[] = [];

        if (options.action) { conditions.push("action = ?"); params.push(options.action); }
        if (options.status) { conditions.push("status = ?"); params.push(options.status); }
        if (options.agent) { conditions.push("agent = ?"); params.push(options.agent); }
        if (options.traceId) { conditions.push("traceId = ?"); params.push(options.traceId); }
        if (options.dataCategory) { conditions.push("dataCategory = ?"); params.push(options.dataCategory); }
        if (options.since) { conditions.push("timestamp >= ?"); params.push(options.since); }
        if (options.until) { conditions.push("timestamp <= ?"); params.push(options.until); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
        const limit = options.limit || 50;
        const offset = options.offset || 0;

        const rows = db.prepare(
            `SELECT * FROM ${this.TABLE} ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
        ).all(...params, limit, offset) as Array<AuditEntry & { details: string | null }>;

        return rows.map(row => ({
            ...row,
            details: row.details ? JSON.parse(row.details) : undefined,
        }));
    }

    /**
   * [KVKK Art. 11] Deletes records upon data subject request.
   * Clears all records matching a given traceId or agent.
   *
   * @param filter Which records to delete
   * @returns Number of deleted records
   */
    public static deleteByFilter(filter: {
        traceId?: string;
        agent?: string;
        action?: string;
        olderThanDays?: number;
    }): number {
        const db = Storage.getDB();
        const conditions: string[] = [];
        const params: string[] = [];

        if (filter.traceId) { conditions.push("traceId = ?"); params.push(filter.traceId); }
        if (filter.agent) { conditions.push("agent = ?"); params.push(filter.agent); }
        if (filter.action) { conditions.push("action = ?"); params.push(filter.action); }
        if (filter.olderThanDays) {
            conditions.push("timestamp < datetime('now', ? || ' days')");
            params.push(`-${filter.olderThanDays}`);
        }

        if (conditions.length === 0) return 0;

        const result = db.prepare(
            `DELETE FROM ${this.TABLE} WHERE ${conditions.join(" AND ")}`
        ).run(...params);

        return result.changes;
    }

    /**
     * [KVKK/GDPR] Cleans expired records.
     * Operates based on each audit record's retentionDays field.
     * Can be auto-triggered by cron job or each Audit.log() call.
     *
     * @returns Number of cleaned records
     */
    public static cleanExpired(): number {
        const db = Storage.getDB();
        const result = db.prepare(`
            DELETE FROM ${this.TABLE}
            WHERE retentionDays IS NOT NULL
            AND timestamp < datetime('now', '-' || retentionDays || ' days')
        `).run();
        if (result.changes > 0) {
            logger.info(`[AUDIT] Expired records cleaned: ${result.changes}`);
        }
        return result.changes;
    }

    /**
     * Returns audit statistics.
     */
    public static getStats(): {
        total: number;
        byStatus: Record<string, number>;
        byAction: Record<string, number>;
        byCategory: Record<string, number>;
        recentErrors: AuditEntry[];
        expiredCount: number;
        } {
        const db = Storage.getDB();
        this.cleanExpired();

        const total = (db.prepare(`SELECT COUNT(*) as count FROM ${this.TABLE}`).get() as { count: number }).count;

        const byStatusRows = db.prepare(
            `SELECT status, COUNT(*) as count FROM ${this.TABLE} GROUP BY status`
        ).all() as Array<{ status: string; count: number }>;

        const byActionRows = db.prepare(
            `SELECT action, COUNT(*) as count FROM ${this.TABLE} GROUP BY action ORDER BY count DESC LIMIT 10`
        ).all() as Array<{ action: string; count: number }>;

        const byCategoryRows = db.prepare(
            `SELECT dataCategory, COUNT(*) as count FROM ${this.TABLE} GROUP BY dataCategory`
        ).all() as Array<{ dataCategory: string; count: number }>;

        const errors = db.prepare(
            `SELECT * FROM ${this.TABLE} WHERE status IN ('FAILED', 'BLOCKED') ORDER BY timestamp DESC LIMIT 10`
        ).all() as Array<AuditEntry & { details: string | null }>;

        const expiredCount = (
            db.prepare(`
                SELECT COUNT(*) as count FROM ${this.TABLE}
                WHERE retentionDays IS NOT NULL
                AND timestamp < datetime('now', '-' || retentionDays || ' days')
            `).get() as { count: number }
        ).count;

        return {
            total,
            byStatus: Object.fromEntries(byStatusRows.map(r => [r.status, r.count])),
            byAction: Object.fromEntries(byActionRows.map(r => [r.action, r.count])),
            byCategory: Object.fromEntries(byCategoryRows.map(r => [r.dataCategory, r.count])),
            recentErrors: errors.map(row => ({
                ...row,
                details: row.details ? JSON.parse(row.details) : undefined,
            })),
            expiredCount,
        };
    }

    /**
     * [KVKK Art. 7] Clears all audit records.
     * Used under the "Right to Erasure" provision.
     * Only authorized users may call this.
     */
    public static clearAll(confirmationCode: string): number {
        if (confirmationCode !== "KVKK-RIGHT-TO-ERASURE") {
            throw new Error("[AUDIT] Invalid confirmation code for data erasure");
        }
        const db = Storage.getDB();
        const result = db.prepare(`DELETE FROM ${this.TABLE}`).run();
        logger.info(`[AUDIT] All records cleared (${result.changes} records). KVKK Article 7 compliance.`);
        return result.changes;
    }
}
