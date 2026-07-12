/**
 * Tamper-evident audit hash chain helpers (Phase 1.4).
 *
 * Chain: each entry stores prev_hash (previous entry hash or GENESIS) and hash = SHA-256(payload).
 * Any mutation of historical rows fails verification.
 */

import crypto from "crypto";

export const AUDIT_CHAIN_GENESIS = "GENESIS";

export function sha256Hex(payload: string): string {
    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/**
 * Canonical payload for agent execution logs (Storage.saveLog).
 * MUST stay stable — changing it breaks verification of existing DBs.
 */
export function buildAgentLogChainPayload(fields: {
    prevHash: string;
    agent: string;
    action: string;
    traceId: string;
    status: string;
    summary: string;
    timestamp: string;
}): string {
    return [
        fields.prevHash,
        fields.agent,
        fields.action,
        fields.traceId,
        fields.status,
        fields.summary,
        fields.timestamp,
    ].join("|");
}

/**
 * Canonical payload for structured Audit.log entries.
 */
export function buildStructuredAuditChainPayload(fields: {
    prevHash: string;
    agent: string;
    action: string;
    status: string;
    traceId: string;
    timestamp: string;
    detailsJson: string;
    errorMessage: string;
}): string {
    return [
        fields.prevHash,
        fields.agent,
        fields.action,
        fields.status,
        fields.traceId,
        fields.timestamp,
        fields.detailsJson,
        fields.errorMessage,
    ].join("|");
}

export interface ChainRow {
    id: number;
    prev_hash: string | null;
    hash: string | null;
}

export interface ChainVerifyResult {
    valid: boolean;
    checked: number;
    failedLogId?: number;
    reason?: string;
    tip?: string;
}

/**
 * Verify a sequence of rows already ordered by id ASC.
 * `computePayload(row, prevHash)` must rebuild the exact string used at insert time.
 */
export function verifyHashChain<T extends ChainRow>(
    rows: T[],
    computePayload: (row: T, prevHash: string) => string,
): ChainVerifyResult {
    let expectedPrev = AUDIT_CHAIN_GENESIS;
    let checked = 0;

    for (const row of rows) {
        checked++;
        const prev = row.prev_hash || "";
        if (prev !== expectedPrev) {
            return {
                valid: false,
                checked,
                failedLogId: row.id,
                reason: `prev_hash mismatch at row ${row.id}`,
                tip: "A log was deleted, reordered, or inserted out of chain order.",
            };
        }
        if (!row.hash) {
            return {
                valid: false,
                checked,
                failedLogId: row.id,
                reason: `Missing hash at row ${row.id}`,
                tip: "Legacy row without hash; re-seed or accept and re-hash from tip.",
            };
        }
        const payload = computePayload(row, prev);
        const calculated = sha256Hex(payload);
        if (calculated !== row.hash) {
            return {
                valid: false,
                checked,
                failedLogId: row.id,
                reason: `Hash corruption at row ${row.id}`,
                tip: "Row content was modified after append.",
            };
        }
        expectedPrev = row.hash;
    }

    return { valid: true, checked };
}
