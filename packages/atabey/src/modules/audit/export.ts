import { chainDigest, sha256Hex } from "atabey-shared/audit-chain.js";
import { Storage, type LogRow } from "../../shared/storage.js";

/**
 * ─── SIGNED AUDIT EXPORT ─────────────────────────────────────────────
 *
 * Exports the execution/audit log as a tamper-evident bundle: a canonical
 * payload hashed with SHA-256 (contentHash) and signed with the keyed
 * audit HMAC (signature). Intended for enterprise evidence / KVKK-GDPR
 * data-subject or regulator requests.
 */
export interface AuditExport {
    generatedAt: string;
    count: number;
    entries: LogRow[];
    contentHash: string;
    signature: string;
}

/**
 * Canonical form covered by contentHash + signature.
 *
 * `v: 2` and `count` are included so that tampering with the reported entry
 * count invalidates the signature. Bundles exported before v0.1.7 (which did
 * not cover `count`) will fail verification — re-export them.
 */
function canonical(generatedAt: string, count: number, entries: LogRow[]): string {
    return JSON.stringify({
        v: 2,
        generatedAt,
        count,
        entries: entries.map((e) => ({
            id: e.id,
            timestamp: e.timestamp,
            agent: e.agent,
            action: e.action,
            trace_id: e.trace_id ?? null,
            status: e.status,
            summary: e.summary,
            prev_hash: e.prev_hash ?? null,
            hash: e.hash ?? null,
        })),
    });
}

export function buildAuditExport(options: { limit?: number } = {}): AuditExport {
    const all = Storage.getLogs();
    // getLogs returns newest-first; keep the most recent `limit` then restore chronological order.
    const sliced = options.limit ? all.slice(0, options.limit) : all;
    const entries = [...sliced].reverse();
    const generatedAt = new Date().toISOString();
    const payload = canonical(generatedAt, entries.length, entries);
    return {
        generatedAt,
        count: entries.length,
        entries,
        contentHash: sha256Hex(payload),
        signature: chainDigest(payload),
    };
}

export function verifyAuditExport(e: AuditExport): boolean {
    // Guard against malformed bundles (missing/invalid fields) instead of throwing.
    if (!e || typeof e.generatedAt !== "string" || !Array.isArray(e.entries)) return false;
    if (typeof e.count !== "number" || e.count !== e.entries.length) return false;
    const payload = canonical(e.generatedAt, e.count, e.entries);
    return sha256Hex(payload) === e.contentHash && chainDigest(payload) === e.signature;
}

export function auditExportToJson(e: AuditExport): string {
    return JSON.stringify(e, null, 2);
}

function csvEscape(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
}

export function auditExportToCsv(e: AuditExport): string {
    const header = "id,timestamp,agent,action,trace_id,status,summary,hash";
    const rows = e.entries.map((x) =>
        [
            x.id,
            x.timestamp,
            x.agent,
            x.action,
            x.trace_id ?? "",
            x.status,
            csvEscape(x.summary ?? ""),
            x.hash ?? "",
        ].join(","),
    );
    return [header, ...rows, `# contentHash=${e.contentHash}`, `# signature=${e.signature}`].join("\n") + "\n";
}
