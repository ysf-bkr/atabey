import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Audit } from "../../src/shared/audit.js";
import { Storage } from "../../src/shared/storage.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-audit-test-" + Date.now());

describe("Audit Log Service", () => {
    beforeAll(() => {
        process.env.ATABEY_TEST_DIR = TEST_DIR;
        fs.mkdirSync(path.join(TEST_DIR, "logs"), { recursive: true });
        Storage.setMetadata("phase", "PHASE_0");
        Audit.initialize();
    });

    afterAll(() => {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
        Storage.reset();
    });

    it("should log an audit entry", () => {
        Audit.log("user.create", "SUCCESS", {
            agent: "@backend",
            traceId: "T-001",
            details: { userId: "usr_123", role: "admin" },
        });

        const logs = Audit.query({ action: "user.create" });
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].status).toBe("SUCCESS");
        expect(logs[0].agent).toBe("@backend");
    });

    it("should log failed operations", () => {
        Audit.log("database.migrate", "FAILED", {
            agent: "@database",
            errorMessage: "Migration failed: duplicate column",
            details: { migration: "2026_01_01_init" },
        });

        const logs = Audit.query({ status: "FAILED" });
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].errorMessage).toContain("Migration failed");
    });

    it("should filter by agent", () => {
        Audit.log("deploy.app", "SUCCESS", { agent: "@devops" });
        Audit.log("deploy.app", "SUCCESS", { agent: "@devops" });

        const logs = Audit.query({ agent: "@devops" });
        expect(logs.length).toBeGreaterThanOrEqual(2);
        logs.forEach(log => expect(log.agent).toBe("@devops"));
    });

    it("should return statistics", () => {
        const stats = Audit.getStats();
        expect(stats.total).toBeGreaterThan(0);
        expect(stats.byStatus.SUCCESS).toBeGreaterThan(0);
    });
});
