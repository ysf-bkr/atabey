/**
 * AI discipline engine stats and call history.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { StorageApprovals } from "./approvals.js";

export class StorageDiscipline extends StorageApprovals {
    public static saveDiscipline(agent: string, stats: { totalCalls: number; violations: number; lastViolation: string | null; cooldownUntil: number }): void {
        const cleanAgent = agent.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO discipline (agent, total_calls, violations, last_violation, cooldown_until, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(agent) DO UPDATE SET
                total_calls = excluded.total_calls,
                violations = excluded.violations,
                last_violation = excluded.last_violation,
                cooldown_until = excluded.cooldown_until,
                updated_at = datetime('now')
        `).run(cleanAgent, stats.totalCalls, stats.violations, stats.lastViolation, stats.cooldownUntil);
    }

    public static getDiscipline(agent: string): { agent: string; totalCalls: number; violations: number; lastViolation: string | null; cooldownUntil: number } | null {
        const cleanAgent = agent.replace("@", "");
        try {
            const row = this.getDB().prepare("SELECT * FROM discipline WHERE agent = ?").get(cleanAgent) as {
                agent: string;
                total_calls: number;
                violations: number;
                last_violation: string | null;
                cooldown_until: number;
            } | undefined;
            if (!row) return null;
            return {
                agent: row.agent,
                totalCalls: row.total_calls,
                violations: row.violations,
                lastViolation: row.last_violation,
                cooldownUntil: row.cooldown_until
            };
        } catch (err) {
            logger.debug(`Failed to get discipline: ${(err as Error).message}`);
            return null;
        }
    }

    public static getAllDiscipline(): Array<{ agent: string; totalCalls: number; violations: number; lastViolation: string | null; cooldownUntil: number }> {
        try {
            const rows = this.getDB().prepare("SELECT * FROM discipline").all() as Array<{
                agent: string;
                total_calls: number;
                violations: number;
                last_violation: string | null;
                cooldown_until: number;
            }>;
            return rows.map(row => ({
                agent: row.agent,
                totalCalls: row.total_calls,
                violations: row.violations,
                lastViolation: row.last_violation,
                cooldownUntil: row.cooldown_until
            }));
        } catch (err) {
            logger.debug(`Failed to get all discipline: ${(err as Error).message}`);
            return [];
        }
    }

    public static clearAllDiscipline(): void {
        try {
            this.getDB().prepare("DELETE FROM discipline").run();
        } catch (err) {
            logger.debug(`Failed to clear discipline: ${(err as Error).message}`);
        }
    }

    public static recordDisciplineCall(agent: string, tool: string, timestamp: number, argsSize: number): void {
        const cleanAgent = agent.replace("@", "");
        try {
            this.getDB().prepare(
                "INSERT INTO discipline_calls (agent, tool, ts, args_size) VALUES (?, ?, ?, ?)"
            ).run(cleanAgent, tool, timestamp, argsSize);
        } catch (err) {
            logger.debug(`Failed to record discipline call: ${(err as Error).message}`);
        }
    }

    public static getRecentDisciplineCalls(agent: string, sinceTs: number): Array<{ tool: string; timestamp: number; argsSize: number }> {
        const cleanAgent = agent.replace("@", "");
        try {
            const rows = this.getDB().prepare(
                "SELECT tool, ts, args_size FROM discipline_calls WHERE agent = ? AND ts > ? ORDER BY ts ASC"
            ).all(cleanAgent, sinceTs) as Array<{ tool: string; ts: number; args_size: number }>;
            return rows.map(r => ({ tool: r.tool, timestamp: r.ts, argsSize: r.args_size }));
        } catch (err) {
            logger.debug(`Failed to get recent discipline calls: ${(err as Error).message}`);
            return [];
        }
    }

    public static pruneDisciplineCalls(beforeTs: number): void {
        try {
            this.getDB().prepare("DELETE FROM discipline_calls WHERE ts < ?").run(beforeTs);
        } catch (err) {
            logger.debug(`Failed to prune discipline calls: ${(err as Error).message}`);
        }
    }

    public static clearDisciplineCalls(agent?: string): void {
        try {
            if (agent) {
                this.getDB().prepare("DELETE FROM discipline_calls WHERE agent = ?").run(agent.replace("@", ""));
            } else {
                this.getDB().prepare("DELETE FROM discipline_calls").run();
            }
        } catch (err) {
            logger.debug(`Failed to clear discipline calls: ${(err as Error).message}`);
        }
    }
}
