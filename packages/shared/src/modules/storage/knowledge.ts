/**
 * Knowledge base file persistence (`.atabey/knowledge/*` mirror in SQLite).
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { StorageBase } from "./base.js";

export class StorageKnowledge extends StorageBase {
    public static getKnowledgeList(): Array<{ filename: string; updated_at: string }> {
        try {
            return this.getDB().prepare("SELECT filename, updated_at FROM knowledge ORDER BY updated_at DESC").all() as Array<{ filename: string; updated_at: string }>;
        } catch (err) {
            logger.debug(`Failed to get knowledge list: ${(err as Error).message}`);
            return [];
        }
    }

    public static getKnowledgeFile(filename: string): { filename: string; content: string; updated_at: string } | null {
        try {
            const row = this.getDB().prepare("SELECT * FROM knowledge WHERE filename = ?").get(filename) as { filename: string; content: string; updated_at: string } | undefined;
            return row || null;
        } catch (err) {
            logger.debug(`Failed to get knowledge file: ${(err as Error).message}`);
            return null;
        }
    }

    public static saveKnowledgeFile(filename: string, content: string): void {
        this.getDB().prepare(`
            INSERT INTO knowledge (filename, content, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(filename) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
        `).run(filename, content);
    }

    public static deleteKnowledgeFile(filename: string): boolean {
        const info = this.getDB().prepare("DELETE FROM knowledge WHERE filename = ?").run(filename);
        return info.changes > 0;
    }
}
