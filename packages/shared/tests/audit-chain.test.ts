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
});
