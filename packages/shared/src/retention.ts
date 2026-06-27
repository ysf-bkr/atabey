/**
 * [KVKK/GDPR] Data Retention & Privacy Service
 *
 * KVKK Art. 4, 5, 7, 11 and GDPR Art. 5, 17 compliant data retention management.
 *
 * Features:
 * - Automatic expired record cleanup
 * - Data categorization (operational, user_data, api_call, security, compliance)
 * - "Right to Erasure" support
 * - Configurable retention policies
 * - Periodic cleanup cron job
 */
import { Audit } from "./audit.js";
import { logger } from "./logger.js";
import { databaseHolder } from "./database.js";

/**
 * Data retention categories and default durations (days)
 */
export const RETENTION_POLICIES: Record<string, number> = {
    OPERATIONAL: 30,    // Operational logs: 30 days
    USER_DATA: 90,      // User data: 90 days (KVKK Art. 5)
    API_CALL: 180,      // API call records: 180 days
    SECURITY: 365,      // Security logs: 1 year
    COMPLIANCE: 730,    // Compliance records: 2 years
};

/**
 * [KVKK/GDPR] Data Retention Manager
 */
export class DataRetention {
    private static cleanupInterval: ReturnType<typeof setInterval> | null = null;

    /**
   * Initialize data retention with automatic cleanup.
   * Starts a periodic cleanup job.
   *
   * @param intervalMs Cleanup interval in milliseconds (default: 1 hour)
   */
    static initialize(intervalMs = 3600000): void {
    // Run initial cleanup
        this.runCleanup();

        // Schedule periodic cleanup
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.cleanupInterval = setInterval(() => this.runCleanup(), intervalMs);

        logger.info(
            "[RETENTION] Data retention initialized. " +
      `Cleanup interval: ${intervalMs / 60000}min. ` +
      `Policies: ${Object.entries(RETENTION_POLICIES).map(([k, v]) => `${k}=${v}d`).join(", ")}`
        );
    }

    /**
   * Run cleanup for all data stores.
   * Cleans audit logs, messages, and logs based on retention policies.
   */
    static runCleanup(): { audit: number; messages: number; logs: number } {
        const result = { audit: 0, messages: 0, logs: 0 };

        try {
            // 1. Clean audit logs
            result.audit = Audit.cleanExpired();

            // 2. Clean old messages (Hermes message queue)
            result.messages = this.cleanOldMessages();

            // 3. Clean old logs
            result.logs = this.cleanOldLogs();

            if (result.audit > 0 || result.messages > 0 || result.logs > 0) {
                logger.info(
                    "[RETENTION] Cleanup complete: " +
          `${result.audit} audit, ${result.messages} messages, ${result.logs} logs`
                );
            }
        } catch (error: unknown) {
            logger.error(`[RETENTION] Cleanup failed: ${(error as Error).message}`);
        }

        return result;
    }

    /**
   * [KVKK Art. 7] "Right to Erasure" — Deletes all data for a given trace ID.
   * Cleans audit records, messages, logs, and tasks.
   *
   * @param traceId Trace ID to erase
   * @returns Total number of deleted records
   */
    static eraseTraceData(traceId: string): number {
        let total = 0;

        // Audit logs
        total += Audit.deleteByFilter({ traceId });

        // Messages
        const db = databaseHolder.getDB();
        const msgResult = db.prepare("DELETE FROM messages WHERE trace_id = ?").run(traceId);
        total += msgResult.changes;

        // Tasks
        const taskResult = db.prepare("DELETE FROM tasks WHERE trace_id = ?").run(traceId);
        total += taskResult.changes;

        // Logs
        const logResult = db.prepare("DELETE FROM logs WHERE trace_id = ?").run(traceId);
        total += logResult.changes;

        logger.info(`[RETENTION] Trace ${traceId} erased: ${total} records deleted (KVKK Article 7)`);
        return total;
    }

    /**
   * [KVKK Art. 11] Erases all data.
   * Only works with the confirmation code.
   */
    static eraseAllData(confirmationCode: string): number {
        if (confirmationCode !== "KVKK-RIGHT-TO-ERASURE") {
            throw new Error("[RETENTION] Invalid confirmation code. Use 'KVKK-RIGHT-TO-ERASURE'");
        }

        let total = 0;
        const db = databaseHolder.getDB();

        total += Audit.clearAll(confirmationCode);
        total += db.prepare("DELETE FROM messages").run().changes;
        total += db.prepare("DELETE FROM tasks").run().changes;
        total += db.prepare("DELETE FROM logs").run().changes;
        total += db.prepare("DELETE FROM agents").run().changes;
        total += db.prepare("DELETE FROM metadata").run().changes;

        logger.warn(`[RETENTION] ALL DATA ERASED: ${total} records (KVKK Article 7 - Right to Erasure)`);
        return total;
    }

    /**
   * Get retention statistics.
   */
    static getStats(): {
    auditExpired: number;
    messageCount: number;
    logCount: number;
    taskCount: number;
    policies: Record<string, number>;
    } {
        const db = databaseHolder.getDB();

        const auditExpired = (
      db.prepare(`
        SELECT COUNT(*) as count FROM audit_log
        WHERE retentionDays IS NOT NULL
        AND timestamp < datetime('now', '-' || retentionDays || ' days')
      `).get() as { count: number }
        ).count;

        const messageCount = (db.prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number }).count;
        const logCount = (db.prepare("SELECT COUNT(*) as count FROM logs").get() as { count: number }).count;
        const taskCount = (db.prepare("SELECT COUNT(*) as count FROM tasks").get() as { count: number }).count;

        return {
            auditExpired,
            messageCount,
            logCount,
            taskCount,
            policies: { ...RETENTION_POLICIES },
        };
    }

    /**
   * Stop the periodic cleanup job.
   */
    static shutdown(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            logger.info("[RETENTION] Cleanup job stopped");
        }
    }

    /**
   * Clean old messages from the Hermes queue.
   * Messages older than 30 days are removed.
   */
    private static cleanOldMessages(): number {
        const db = databaseHolder.getDB();
        const result = db.prepare(`
      DELETE FROM messages
      WHERE timestamp < datetime('now', '-30 days')
    `).run();
        return result.changes;
    }

    /**
   * Clean old logs.
   * Logs older than 30 days are removed.
   */
    private static cleanOldLogs(): number {
        const db = databaseHolder.getDB();
        const result = db.prepare(`
      DELETE FROM logs
      WHERE timestamp < datetime('now', '-30 days')
    `).run();
        return result.changes;
    }
}
