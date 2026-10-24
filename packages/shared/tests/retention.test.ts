import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataRetention, RETENTION_POLICIES } from "../src/modules/security/retention.js";
import { AtabeyStorage } from "../src/modules/storage/storage.js";
import { asAgentID, asTraceID } from "../src/modules/primitives/types.js";

/**
 * Right-to-erasure (KVKK Art. 7 / GDPR Art. 17).
 *
 * Regression: `eraseTraceData` read `databaseHolder.getDB()` directly, so on a
 * fresh CLI process — where nothing had opened the database yet — it threw
 * "Atabey Shared Database has not been initialized" and *no data was deleted*.
 * `atabey audit erase <traceId>` was therefore broken while looking fine.
 */
describe("DataRetention", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-retention-"));
        process.env.ATABEY_TEST_DIR = dir;
        AtabeyStorage.reset();
    });

    afterEach(() => {
        AtabeyStorage.reset();
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe("eraseTraceData", () => {
        it("works on a fresh process where only the holder exists (the CLI case)", () => {
            // Seed data first…
            AtabeyStorage.saveLog({
                agent: "@backend",
                action: "WRITE_FILE",
                status: "SUCCESS",
                summary: "trace payload",
                trace_id: "T-ERASE-1",
            });
            const before = AtabeyStorage.getLogs().length;
            expect(before).toBeGreaterThan(0);

            // …then simulate the CLI: reset drops the in-process handle, so the
            // shared databaseHolder is empty again.
            AtabeyStorage.reset();

            expect(() => DataRetention.eraseTraceData("T-ERASE-1")).not.toThrow();
            expect(AtabeyStorage.getLogs().filter((l) => l.trace_id === "T-ERASE-1")).toHaveLength(0);
        });

        it("deletes messages, tasks, logs, costs and approvals for the trace", () => {
            AtabeyStorage.saveMessage({
                from: asAgentID("@manager"),
                to: asAgentID("@backend"),
                category: "ACTION",
                content: "do the thing",
                traceId: asTraceID("T-ERASE-2"),
                priority: "NORMAL",
                status: "PENDING",
                requiresApproval: false,
            } as Parameters<typeof AtabeyStorage.saveMessage>[0]);
            AtabeyStorage.saveTask({
                traceId: asTraceID("T-ERASE-2"),
                description: "erase me",
                agent: asAgentID("@backend"),
                priority: "P2",
                status: "PENDING",
            } as Parameters<typeof AtabeyStorage.saveTask>[0]);
            AtabeyStorage.saveLog({
                agent: "@backend",
                action: "X",
                status: "SUCCESS",
                summary: "erase me",
                trace_id: "T-ERASE-2",
            });
            AtabeyStorage.saveCost({
                provider: "test",
                model: "test",
                inputTokens: 1,
                outputTokens: 1,
                cost: 0.01,
                timestamp: new Date().toISOString(),
                traceId: "T-ERASE-2",
            });
            AtabeyStorage.saveApprovalRequest({
                traceId: "T-ERASE-2",
                toolName: "run_shell_command",
                agent: "@backend",
                riskScore: 80,
                riskLevel: "HIGH",
                reason: "test",
                args: {},
                createdAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            });

            const deleted = DataRetention.eraseTraceData("T-ERASE-2");
            expect(deleted).toBeGreaterThanOrEqual(5);
            expect(AtabeyStorage.getLogs().filter((l) => l.trace_id === "T-ERASE-2")).toHaveLength(0);
            expect(AtabeyStorage.getPendingApprovals().filter((a) => a.traceId === "T-ERASE-2")).toHaveLength(0);
        });

        it("is a no-op for an unknown trace", () => {
            expect(DataRetention.eraseTraceData("T-NOT-THERE")).toBe(0);
        });
    });

    describe("eraseAllData", () => {
        it("rejects a wrong confirmation code and deletes nothing", () => {
            AtabeyStorage.saveLog({ agent: "@backend", action: "X", status: "SUCCESS", summary: "keep me" });
            expect(() => DataRetention.eraseAllData("NOPE")).toThrow(/Invalid confirmation code/);
            expect(AtabeyStorage.getLogs().length).toBeGreaterThan(0);
        });

        it("clears tables with the correct code", () => {
            AtabeyStorage.saveLog({ agent: "@backend", action: "X", status: "SUCCESS", summary: "wipe me" });
            AtabeyStorage.saveMessage({
                from: asAgentID("@manager"),
                to: asAgentID("@backend"),
                category: "ACTION",
                content: "wipe",
                traceId: asTraceID("T-ALL"),
                priority: "NORMAL",
                status: "PENDING",
                requiresApproval: false,
            } as Parameters<typeof AtabeyStorage.saveMessage>[0]);

            const deleted = DataRetention.eraseAllData("KVKK-RIGHT-TO-ERASURE");
            expect(deleted).toBeGreaterThan(0);
            expect(AtabeyStorage.getLogs()).toHaveLength(0);
        });
    });

    describe("cleanup", () => {
        it("runCleanup does not throw on a fresh database", () => {
            expect(() => DataRetention.runCleanup()).not.toThrow();
        });

        it("getStats exposes the reference policy catalogue", () => {
            const stats = DataRetention.getStats();
            expect(stats.policies).toEqual(RETENTION_POLICIES);
        });

        it("initialize schedules and shutdown stops the interval", () => {
            expect(() => DataRetention.initialize(60_000)).not.toThrow();
            expect(() => DataRetention.shutdown()).not.toThrow();
        });
    });
});
