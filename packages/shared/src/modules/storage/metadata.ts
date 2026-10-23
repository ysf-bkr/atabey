/**
 * Arbitrary key/value project metadata.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { StorageCosts } from "./costs.js";

export class StorageMetadata extends StorageCosts {
    public static setMetadata(key: string, value: string) {
        this.getDB().prepare(`
            INSERT INTO metadata (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
        `).run(key, value);
    }

    public static getMetadata(key: string): string | null {
        const row = this.getDB().prepare("SELECT value FROM metadata WHERE key = ?").get(key) as { value: string } | undefined;
        return row ? row.value : null;
    }

    /** All metadata key/value pairs — used to render custom memory sections. */
    public static getAllMetadata(): Record<string, string> {
        const rows = this.getDB().prepare("SELECT key, value FROM metadata").all() as Array<{ key: string; value: string }>;
        const out: Record<string, string> = {};
        for (const r of rows) out[r.key] = r.value;
        return out;
    }
}
