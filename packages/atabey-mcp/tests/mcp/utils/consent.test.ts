import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

describe("consent logging", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-consent-"));
        process.env.ATABEY_FRAMEWORK_DIR = path.join(tempDir, ".atabey");
    });

    afterEach(() => {
        delete process.env.ATABEY_FRAMEWORK_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should record and list consent entries", async () => {
        const { recordConsent, listConsentRecords, getConsentStats } =
            await import("../../../src/mcp/utils/consent.js");

        recordConsent({
            subject: "user-1",
            purpose: "ai-assisted-development",
            granted: true,
            legalBasis: "consent",
        });

        const records = listConsentRecords();
        expect(records.length).toBe(1);
        expect(records[0].subject).toBe("user-1");
        expect(records[0].granted).toBe(true);

        const stats = getConsentStats();
        expect(stats.total).toBe(1);
        expect(stats.granted).toBe(1);
    });
});