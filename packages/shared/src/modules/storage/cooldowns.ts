/**
 * Loop-detector cooldown state (restart-durable).
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { StorageMetadata } from "./metadata.js";

export class StorageCooldowns extends StorageMetadata {
    public static saveLoopCooldown(agent: string, cooldownUntil: number, detail: string | null, cooldownCount: number = 1): void {
        const cleanAgent = agent.replace("@", "");
        this.getDB().prepare(`
            INSERT INTO loop_cooldowns (agent, cooldown_until, detail, cooldown_count, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'))
            ON CONFLICT(agent) DO UPDATE SET
                cooldown_until = excluded.cooldown_until,
                detail = excluded.detail,
                cooldown_count = excluded.cooldown_count,
                updated_at = datetime('now')
        `).run(cleanAgent, cooldownUntil, detail, cooldownCount);
    }

    public static getLoopCooldown(agent: string): { agent: string; cooldownUntil: number; detail: string | null; cooldownCount: number } | null {
        const cleanAgent = agent.replace("@", "");
        try {
            const row = this.getDB().prepare("SELECT * FROM loop_cooldowns WHERE agent = ?").get(cleanAgent) as {
                agent: string;
                cooldown_until: number;
                detail: string | null;
                cooldown_count: number;
            } | undefined;
            if (!row) return null;
            return {
                agent: row.agent,
                cooldownUntil: row.cooldown_until,
                detail: row.detail,
                cooldownCount: row.cooldown_count
            };
        } catch (err) {
            logger.debug(`Failed to get loop cooldown: ${(err as Error).message}`);
            return null;
        }
    }

    public static clearLoopCooldown(agent: string): boolean {
        const cleanAgent = agent.replace("@", "");
        const info = this.getDB().prepare("DELETE FROM loop_cooldowns WHERE agent = ?").run(cleanAgent);
        return info.changes > 0;
    }

    public static clearAllLoopCooldowns(): void {
        try {
            this.getDB().prepare("DELETE FROM loop_cooldowns").run();
        } catch (err) {
            logger.debug(`Failed to clear all loop cooldowns: ${(err as Error).message}`);
        }
    }

    public static listActiveLoopCooldowns(): Array<{
        agent: string;
        cooldownUntil: number;
        detail: string | null;
        cooldownCount: number;
    }> {
        const now = Date.now();
        try {
            const rows = this.getDB().prepare("SELECT * FROM loop_cooldowns WHERE cooldown_until > ?").all(now) as Array<{
                agent: string;
                cooldown_until: number;
                detail: string | null;
                cooldown_count: number;
            }>;
            return rows.map(r => ({
                agent: r.agent,
                cooldownUntil: r.cooldown_until,
                detail: r.detail,
                cooldownCount: r.cooldown_count
            }));
        } catch (err) {
            logger.debug(`Failed to list active loop cooldowns: ${(err as Error).message}`);
            return [];
        }
    }

    public static purgeExpiredLoopCooldowns(): number {
        const now = Date.now();
        try {
            const info = this.getDB().prepare("DELETE FROM loop_cooldowns WHERE cooldown_until <= ?").run(now);
            return info.changes;
        } catch (err) {
            logger.debug(`Failed to purge expired loop cooldowns: ${(err as Error).message}`);
            return 0;
        }
    }
}
