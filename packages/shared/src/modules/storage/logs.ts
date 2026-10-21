/**
 * Hash-chained audit log persistence (KVKK/GDPR compliant, PII masked).
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { AUDIT_CHAIN_GENESIS, buildAgentLogChainPayload, chainDigest, readChainAnchor, writeChainAnchor, verifyHashChain } from "../observability/audit-chain.js";
import { maskText } from "../security/pii.js";
import { asAgentID, asLogID } from "../primitives/types.js";
import type { TraceID } from "../primitives/types.js";
import type { LogRow, LogDbRow } from "./types.js";
import { StorageTasks } from "./tasks.js";

export class StorageLogs extends StorageTasks {
    public static saveLog(log: {
        agent: string;
        action: string;
        trace_id?: string;
        status: string;
        summary: string;
        findings?: string;
    }): number {
        const db = this.getDB();
        const timestamp = new Date().toISOString();
        const agent = log.agent.replace("@", "");
        const maskedSummary = maskText(log.summary);
        const maskedFindings = log.findings ? maskText(log.findings) : null;
        const traceId = log.trace_id || "";

        let lastId = 0;
        const insert = db.transaction(() => {
            let prevHash = AUDIT_CHAIN_GENESIS;
            try {
                const lastRow = db.prepare(
                    "SELECT hash FROM logs WHERE hash IS NOT NULL ORDER BY id DESC LIMIT 1"
                ).get() as { hash: string } | undefined;
                if (lastRow && lastRow.hash) {
                    prevHash = lastRow.hash;
                }
            } catch { /* best-effort fallback to genesis */ }

            const payload = buildAgentLogChainPayload({
                prevHash,
                timestamp,
                agent,
                action: log.action,
                traceId: traceId || "",
                status: log.status,
                summary: maskedSummary,
            });
            const hash = chainDigest(payload);

            const result = db.prepare(`
                INSERT INTO logs (timestamp, agent, action, trace_id, status, summary, findings, prev_hash, hash)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(timestamp, agent, log.action, log.trace_id || null, log.status, maskedSummary, maskedFindings, prevHash, hash);
            lastId = Number(result.lastInsertRowid);

            const count = (db.prepare("SELECT COUNT(*) AS c FROM logs WHERE hash IS NOT NULL").get() as { c: number }).c;
            writeChainAnchor("agent-log", hash, count);
        });

        insert();
        return lastId;
    }

    public static verifyLogIntegrity(): {
        valid: boolean;
        checked?: number;
        failedLogId?: number;
        reason?: string;
        tip?: string;
    } {
        const db = this.getDB();
        try {
            const rows = db.prepare(
                "SELECT * FROM logs ORDER BY id ASC"
            ).all() as Array<{
                id: number;
                timestamp: string;
                agent: string;
                action: string;
                trace_id: string | null;
                status: string;
                summary: string;
                findings: string | null;
                prev_hash: string | null;
                hash: string | null;
            }>;
            const hashed = rows.filter((r) => r.hash);
            if (hashed.length === 0) {
                return { valid: true, checked: 0, reason: "No hashed log rows yet" };
            }
            const anchor = readChainAnchor("agent-log");
            return verifyHashChain(
                hashed,
                (row, prevHash) =>
                    buildAgentLogChainPayload({
                        prevHash,
                        agent: row.agent,
                        action: row.action,
                        traceId: row.trace_id || "",
                        status: row.status,
                        summary: row.summary,
                        timestamp: row.timestamp,
                    }),
                { expectedTip: anchor?.tip, expectedCount: anchor?.count },
            );
        } catch (err) {
            return { valid: false, reason: `Verification error: ${(err as Error).message}` };
        }
    }

    public static getLogs(agentName?: string): LogRow[] {
        const db = this.getDB();
        let rows: LogDbRow[];
        const cleanName = agentName ? agentName.replace("@", "") : undefined;

        if (cleanName) {
            rows = db.prepare("SELECT * FROM logs WHERE agent = ? ORDER BY timestamp DESC, id DESC").all(cleanName) as LogDbRow[];
        } else {
            rows = db.prepare("SELECT * FROM logs ORDER BY timestamp DESC, id DESC").all() as LogDbRow[];
        }

        return rows.map(r => ({
            id: asLogID(r.id),
            timestamp: r.timestamp,
            agent: asAgentID(r.agent),
            action: r.action,
            trace_id: (r.trace_id as TraceID) || undefined,
            status: r.status,
            summary: maskText(r.summary),
            findings: r.findings ? maskText(r.findings) : undefined,
            prev_hash: r.prev_hash || undefined,
            hash: r.hash || undefined
        }));
    }
}
