import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
    auditExportToCsv,
    auditExportToJson,
    buildAuditExport,
    verifyAuditExport,
} from "../../../src/modules/audit/export.js";
import { Storage } from "../../../src/shared/storage.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-audit-" + Date.now());

beforeAll(() => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    fs.mkdirSync(TEST_DIR, { recursive: true });
    Storage.reset();
    Storage.saveLog({ agent: "@backend", action: "WRITE_FILE", status: "SUCCESS", summary: "created a.ts" });
    Storage.saveLog({ agent: "@quality", action: "QUALITY_CHECK", status: "SUCCESS", summary: "passed" });
});

afterAll(() => {
    Storage.reset();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("signed audit export", () => {
    it("builds a signed, verifiable export", () => {
        const exp = buildAuditExport();
        expect(exp.count).toBeGreaterThanOrEqual(2);
        expect(exp.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(exp.signature).toMatch(/^[a-f0-9]{64}$/);
        expect(verifyAuditExport(exp)).toBe(true);
    });

    it("detects tampering with an entry", () => {
        const exp = buildAuditExport();
        exp.entries[0].summary = "tampered";
        expect(verifyAuditExport(exp)).toBe(false);
    });

    it("detects tampering with the reported entry count", () => {
        const exp = buildAuditExport();
        const original = exp.count;
        exp.count = original + 5;
        expect(verifyAuditExport(exp)).toBe(false);
    });

    it("rejects a bundle whose count disagrees with its entries", () => {
        const exp = buildAuditExport();
        exp.count = 0;
        expect(verifyAuditExport(exp)).toBe(false);
    });

    it("detects tampering with generatedAt", () => {
        const exp = buildAuditExport();
        exp.generatedAt = "2020-01-01T00:00:00.000Z";
        expect(verifyAuditExport(exp)).toBe(false);
    });

    it("rejects malformed bundles instead of throwing", () => {
        expect(verifyAuditExport(null as unknown as ReturnType<typeof buildAuditExport>)).toBe(false);
        expect(verifyAuditExport({ generatedAt: "x", count: 1, entries: undefined } as unknown as ReturnType<typeof buildAuditExport>)).toBe(false);
    });

    it("survives a JSON round-trip (export → file → verify)", () => {
        const exp = buildAuditExport();
        const parsed = JSON.parse(auditExportToJson(exp));
        expect(verifyAuditExport(parsed)).toBe(true);
    });

    it("renders JSON and CSV with the signature", () => {
        const exp = buildAuditExport({ limit: 1 });
        expect(exp.count).toBe(1);
        const json = auditExportToJson(exp);
        expect(json).toContain(exp.signature);
        const csv = auditExportToCsv(exp);
        expect(csv).toContain("contentHash=");
        expect(csv).toContain("signature=");
        expect(csv.split("\n")[0]).toBe("id,timestamp,agent,action,trace_id,status,summary,hash");
    });
});
