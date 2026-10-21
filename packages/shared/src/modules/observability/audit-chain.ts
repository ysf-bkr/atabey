/**
 * Tamper-evident audit hash chain helpers (Phase 1.4).
 *
 * Chain: each entry stores prev_hash (previous entry hash or GENESIS) and hash = SHA-256(payload).
 * Any mutation of historical rows fails verification.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { databaseHolder } from "../storage/database.js";

export const AUDIT_CHAIN_GENESIS = "GENESIS";

/**
 * Resolve the HMAC key for the audit chain (memoized).
 *
 * Priority:
 *   1. ATABEY_AUDIT_HMAC_KEY env var (recommended for production / secret managers)
 *   2. `.atabey/audit-hmac.key` next to the SQLite DB (created 0600 on first use)
 *   3. null → falls back to unkeyed SHA-256 (insecure; warned once)
 *
 * A key is required for the chain to be genuinely tamper-evident. Without it,
 * anyone who can write the DB can also recompute the hashes.
 */
let cachedKey: Buffer | null | undefined;
let warnedUnkeyed = false;

const inMemoryAnchors = new Map<string, ChainAnchor>();

/** Directory holding the HMAC key and chain anchor (next to the SQLite DB), or null for :memory: DBs. */
function resolveChainDir(): string | null {
    const envDir = process.env.ATABEY_TEST_DIR || process.env.ATABEY_FRAMEWORK_DIR;
    if (envDir && envDir.trim()) {
        return envDir.trim();
    }
    try {
        const db = databaseHolder.getDB() as unknown as { name?: string; memory?: boolean };
        if (db) {
            if (db.memory === true || db.name === ":memory:" || db.name === "") {
                return null;
            }
            if (typeof db.name === "string" && db.name) {
                return path.dirname(db.name);
            }
        }
    } catch {
        /* DB not initialized yet */
    }
    return process.env.VITEST
        ? path.join(os.tmpdir(), `atabey-vitest-worker-${process.pid}`, ".atabey")
        : path.join(process.cwd(), ".atabey");
}

export function resolveAuditChainKey(): Buffer | null {
    if (cachedKey !== undefined) return cachedKey;

    const envKey = process.env.ATABEY_AUDIT_HMAC_KEY;
    if (envKey && envKey.trim()) {
        cachedKey = Buffer.from(envKey.trim(), "utf8");
        return cachedKey;
    }

    const dir = resolveChainDir();
    if (!dir) {
        cachedKey = null;
        return cachedKey;
    }
    const keyFile = path.join(dir, "audit-hmac.key");
    try {
        if (fs.existsSync(keyFile)) {
            cachedKey = fs.readFileSync(keyFile);
            return cachedKey;
        }
        if (process.env.ATABEY_AUDIT_HMAC_AUTOCREATE !== "false" && !process.env.VITEST) {
            fs.mkdirSync(dir, { recursive: true });
            const generated = crypto.randomBytes(32);
            fs.writeFileSync(keyFile, generated, { mode: 0o600 });
            cachedKey = generated;
            return cachedKey;
        }
    } catch {
        /* fall through to unkeyed */
    }

    cachedKey = null;
    return cachedKey;
}

/** Test helper — clears the memoized key. */
export function clearAuditChainKeyCache(): void {
    cachedKey = undefined;
    warnedUnkeyed = false;
    inMemoryAnchors.clear();
}

/**
 * Keyed digest for audit chain entries.
 * Uses HMAC-SHA256 when a key is available; otherwise falls back to plain
 * SHA-256 with a one-time warning (degraded, not recommended).
 */
export function chainDigest(payload: string): string {
    const key = resolveAuditChainKey();
    if (key) {
        return crypto.createHmac("sha256", key).update(payload, "utf8").digest("hex");
    }
    if (!warnedUnkeyed) {
        warnedUnkeyed = true;
        process.stderr.write(
            "[AUDIT] WARNING: no audit HMAC key configured — chain is unkeyed (SHA-256 only). " +
            "Set ATABEY_AUDIT_HMAC_KEY or allow key-file creation for tamper-evidence.\n",
        );
    }
    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

/** @deprecated Use chainDigest() — unkeyed SHA-256 is not tamper-evident. */
export function sha256Hex(payload: string): string {
    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
}

// ─── Chain Anchor (truncation detection) ──────────────────────────────────
// The anchor is stored OUTSIDE the SQLite DB (in the same dir as the HMAC key).
// A naive `DELETE FROM ...` on the DB will then disagree with the anchor.
// Legitimate deletions (retention/erasure) must refresh the anchor.

export interface ChainAnchor {
    tip: string;
    count: number;
    updatedAt: string;
}

function anchorFile(dir: string, name: string): string {
    return path.join(dir, `audit-chain-${name}.anchor.json`);
}

export function writeChainAnchor(name: string, tip: string, count: number): void {
    const data: ChainAnchor = { tip, count, updatedAt: new Date().toISOString() };
    const dir = resolveChainDir();
    if (!dir) {
        inMemoryAnchors.set(name, data);
        return;
    }
    try {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(anchorFile(dir, name), JSON.stringify(data), { mode: 0o600 });
    } catch {
        /* non-fatal: verification will report "no anchor" */
    }
}

export function readChainAnchor(name: string): ChainAnchor | null {
    const dir = resolveChainDir();
    if (!dir) {
        return inMemoryAnchors.get(name) ?? null;
    }
    try {
        const f = anchorFile(dir, name);
        if (!fs.existsSync(f)) return null;
        return JSON.parse(fs.readFileSync(f, "utf8")) as ChainAnchor;
    } catch {
        return null;
    }
}

export function clearChainAnchor(name: string): void {
    inMemoryAnchors.delete(name);
    const dir = resolveChainDir();
    if (!dir) return;
    try {
        const f = anchorFile(dir, name);
        if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch {
        /* ignore */
    }
}

/**
 * Canonical payload for agent execution logs (Storage.saveLog).
 *
 * v2: fields are length-delimited via JSON to remove `|`-join boundary
 * ambiguity (previously agent="a|b" collided with action="b|c"). Changing this
 * invalidates verification of rows written by older (v1) builds.
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
    return JSON.stringify([
        "v2",
        fields.prevHash,
        fields.agent,
        fields.action,
        fields.traceId,
        fields.status,
        fields.summary,
        fields.timestamp,
    ]);
}

/**
 * Canonical payload for structured Audit.log entries (v2, length-delimited).
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
    return JSON.stringify([
        "v2",
        fields.prevHash,
        fields.agent,
        fields.action,
        fields.status,
        fields.traceId,
        fields.timestamp,
        fields.detailsJson,
        fields.errorMessage,
    ]);
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
 *
 * @param options.digest        keyed digest used at insert time (default: chainDigest)
 * @param options.expectedTip   last appended hash (from an external anchor) — detects truncation
 * @param options.expectedCount number of chained rows expected — detects deletion at the tail
 */
export function verifyHashChain<T extends ChainRow>(
    rows: T[],
    computePayload: (row: T, prevHash: string) => string,
    options: {
        digest?: (payload: string) => string;
        expectedTip?: string;
        expectedCount?: number;
    } = {},
): ChainVerifyResult {
    const digest = options.digest ?? chainDigest;
    let expectedPrev = rows.length > 0 ? (rows[0].prev_hash || AUDIT_CHAIN_GENESIS) : AUDIT_CHAIN_GENESIS;
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
        const calculated = digest(payload);
        if (calculated !== row.hash) {
            return {
                valid: false,
                checked,
                failedLogId: row.id,
                reason: `Hash corruption at row ${row.id}`,
                tip: "Row content was modified after append (or the HMAC key changed).",
            };
        }
        expectedPrev = row.hash;
    }

    // Truncation detection against an external anchor.
    if (options.expectedCount !== undefined && rows.length < options.expectedCount) {
        return {
            valid: false,
            checked,
            reason: `Chain truncated: expected ${options.expectedCount} rows, found ${rows.length}.`,
            tip: "Tail audit rows were deleted after append.",
        };
    }
    if (options.expectedTip !== undefined && rows.length > 0) {
        const actualTip = rows[rows.length - 1].hash;
        if (actualTip !== options.expectedTip) {
            return {
                valid: false,
                checked,
                failedLogId: rows[rows.length - 1].id,
                reason: "Chain tip does not match the anchored tip.",
                tip: "Rows were appended/replaced outside the audited writer, or deleted.",
            };
        }
    }

    return { valid: true, checked, tip: rows.length > 0 ? rows[rows.length - 1].hash ?? undefined : undefined };
}
