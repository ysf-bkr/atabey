import { describe, expect, it } from "vitest";
import {
    AUDIT_CHAIN_GENESIS,
    buildAgentLogChainPayload,
    sha256Hex,
    verifyHashChain,
} from "../src/audit-chain.js";

describe("audit-chain helpers", () => {
    it("links entries with sha256", () => {
        const p0 = buildAgentLogChainPayload({
            prevHash: AUDIT_CHAIN_GENESIS,
            agent: "manager",
            action: "A",
            traceId: "T1",
            status: "SUCCESS",
            summary: "first",
            timestamp: "2026-01-01T00:00:00.000Z",
        });
        const h0 = sha256Hex(p0);
        const p1 = buildAgentLogChainPayload({
            prevHash: h0,
            agent: "backend",
            action: "B",
            traceId: "T1",
            status: "SUCCESS",
            summary: "second",
            timestamp: "2026-01-01T00:00:01.000Z",
        });
        const h1 = sha256Hex(p1);

        const rows = [
            { id: 1, prev_hash: AUDIT_CHAIN_GENESIS, hash: h0, agent: "manager", action: "A", trace_id: "T1", status: "SUCCESS", summary: "first", timestamp: "2026-01-01T00:00:00.000Z" },
            { id: 2, prev_hash: h0, hash: h1, agent: "backend", action: "B", trace_id: "T1", status: "SUCCESS", summary: "second", timestamp: "2026-01-01T00:00:01.000Z" },
        ];

        const ok = verifyHashChain(rows, (row, prev) =>
            buildAgentLogChainPayload({
                prevHash: prev,
                agent: row.agent,
                action: row.action,
                traceId: row.trace_id,
                status: row.status,
                summary: row.summary,
                timestamp: row.timestamp,
            }),
        );
        expect(ok.valid).toBe(true);
        expect(ok.checked).toBe(2);
    });

    it("detects content tampering", () => {
        const p0 = buildAgentLogChainPayload({
            prevHash: AUDIT_CHAIN_GENESIS,
            agent: "manager",
            action: "A",
            traceId: "",
            status: "OK",
            summary: "orig",
            timestamp: "t0",
        });
        const h0 = sha256Hex(p0);
        const rows = [
            {
                id: 1,
                prev_hash: AUDIT_CHAIN_GENESIS,
                hash: h0,
                agent: "manager",
                action: "A",
                trace_id: "",
                status: "OK",
                summary: "TAMPERED",
                timestamp: "t0",
            },
        ];
        const bad = verifyHashChain(rows, (row, prev) =>
            buildAgentLogChainPayload({
                prevHash: prev,
                agent: row.agent,
                action: row.action,
                traceId: row.trace_id,
                status: row.status,
                summary: row.summary,
                timestamp: row.timestamp,
            }),
        );
        expect(bad.valid).toBe(false);
        expect(bad.reason).toMatch(/corruption/i);
    });

    it("verifies hash chain continuity when genesis row is pruned by retention", () => {
        // Simulating rows where row 1 was deleted by KVKK retention policy
        const p1 = buildAgentLogChainPayload({
            prevHash: "historical-pruned-hash-999",
            agent: "database",
            action: "MIGRATE",
            traceId: "T2",
            status: "SUCCESS",
            summary: "migrated",
            timestamp: "2026-02-01T00:00:00.000Z",
        });
        const h1 = sha256Hex(p1);
        const p2 = buildAgentLogChainPayload({
            prevHash: h1,
            agent: "backend",
            action: "API_CALL",
            traceId: "T2",
            status: "SUCCESS",
            summary: "called",
            timestamp: "2026-02-01T00:00:01.000Z",
        });
        const h2 = sha256Hex(p2);

        const retainedRows = [
            { id: 2, prev_hash: "historical-pruned-hash-999", hash: h1, agent: "database", action: "MIGRATE", trace_id: "T2", status: "SUCCESS", summary: "migrated", timestamp: "2026-02-01T00:00:00.000Z" },
            { id: 3, prev_hash: h1, hash: h2, agent: "backend", action: "API_CALL", trace_id: "T2", status: "SUCCESS", summary: "called", timestamp: "2026-02-01T00:00:01.000Z" },
        ];

        const result = verifyHashChain(retainedRows, (row, prev) =>
            buildAgentLogChainPayload({
                prevHash: prev,
                agent: row.agent,
                action: row.action,
                traceId: row.trace_id,
                status: row.status,
                summary: row.summary,
                timestamp: row.timestamp,
            }),
        );
        expect(result.valid).toBe(true);
        expect(result.checked).toBe(2);
    });
});
