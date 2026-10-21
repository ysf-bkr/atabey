/**
 * Token cost accounting rows per provider/model.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import type { CostDbRow } from "./types.js";
import { StorageLogs } from "./logs.js";

export class StorageCosts extends StorageLogs {
    public static saveCost(cost: {
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        timestamp: string;
        traceId?: string;
    }): void {
        const db = this.getDB();
        db.prepare(`
            INSERT INTO costs (provider, model, input_tokens, output_tokens, cost, timestamp, trace_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            cost.provider,
            cost.model,
            cost.inputTokens,
            cost.outputTokens,
            cost.cost,
            cost.timestamp,
            cost.traceId || null
        );
    }

    public static getAllCosts(): Array<{
        provider: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cost: number;
        timestamp: string;
        traceId?: string;
    }> {
        const db = this.getDB();
        const rows = db.prepare("SELECT * FROM costs ORDER BY timestamp ASC").all() as CostDbRow[];
        return rows.map(r => ({
            provider: r.provider,
            model: r.model,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            cost: r.cost,
            timestamp: r.timestamp,
            traceId: r.trace_id || undefined
        }));
    }
}
