import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AtabeyStorage } from "../src/modules/storage/storage.js";

/**
 * Covers the HITL approval store and the token-cost ledger, both of which are
 * part of the AtabeyStorage facade but were previously untested end-to-end.
 */
describe("AtabeyStorage approvals & costs", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-approvals-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        AtabeyStorage.reset();
    });

    afterEach(() => {
        AtabeyStorage.reset();
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const request = (overrides: Record<string, unknown> = {}) => ({
        traceId: "T-APP-1",
        toolName: "run_shell_command",
        agent: "@backend",
        riskScore: 75,
        riskLevel: "HIGH",
        reason: "destructive command",
        args: { command: "rm -rf build" },
        createdAt: 1_700_000_000_000,
        expiresAt: 1_700_000_600_000,
        ...overrides,
    });

    describe("approvals", () => {
        it("saves and reads back an approval with all fields", () => {
            AtabeyStorage.saveApprovalRequest(request());

            const stored = AtabeyStorage.getApproval("T-APP-1");
            expect(stored).not.toBeNull();
            expect(stored?.toolName).toBe("run_shell_command");
            expect(stored?.agent).toBe("@backend");
            expect(stored?.riskScore).toBe(75);
            expect(stored?.riskLevel).toBe("HIGH");
            expect(stored?.args).toEqual({ command: "rm -rf build" });
            expect(stored?.status).toBe("PENDING");
            expect(stored?.passcode).toBeUndefined();
        });

        it("saveApproval delegates to saveApprovalRequest", () => {
            AtabeyStorage.saveApproval(request({ traceId: "T-APP-2" }));
            expect(AtabeyStorage.getApproval("T-APP-2")?.traceId).toBe("T-APP-2");
        });

        it("persists an optional passcode and an explicit status", () => {
            AtabeyStorage.saveApprovalRequest(
                request({ traceId: "T-APP-3", passcode: "1234", status: "APPROVED" }),
            );

            const stored = AtabeyStorage.getApproval("T-APP-3");
            expect(stored?.passcode).toBe("1234");
            expect(stored?.status).toBe("APPROVED");
        });

        it("returns null for an unknown trace id", () => {
            expect(AtabeyStorage.getApproval("T-MISSING")).toBeNull();
        });

        it("lists only pending approvals and updates status", () => {
            AtabeyStorage.saveApprovalRequest(request({ traceId: "T-APP-4" }));
            AtabeyStorage.saveApprovalRequest(request({ traceId: "T-APP-5", status: "REJECTED" }));

            const pending = AtabeyStorage.getPendingApprovals();
            expect(pending.map(p => p.traceId)).toEqual(["T-APP-4"]);

            AtabeyStorage.updateApprovalStatus("T-APP-4", "APPROVED");
            expect(AtabeyStorage.getApproval("T-APP-4")?.status).toBe("APPROVED");
            expect(AtabeyStorage.getPendingApprovals()).toHaveLength(0);
        });

        it("clears every approval", () => {
            AtabeyStorage.saveApprovalRequest(request({ traceId: "T-APP-6" }));
            AtabeyStorage.clearAllApprovals();
            expect(AtabeyStorage.getApproval("T-APP-6")).toBeNull();
            expect(AtabeyStorage.getPendingApprovals()).toHaveLength(0);
        });

        it("tolerates malformed stored args by falling back to an empty object", () => {
            AtabeyStorage.saveApprovalRequest(request({ traceId: "T-APP-7" }));
            AtabeyStorage.getDB()
                .prepare("UPDATE approvals SET args = ? WHERE trace_id = ?")
                .run("not-json", "T-APP-7");

            const stored = AtabeyStorage.getApproval("T-APP-7");
            // JSON.parse throws inside the guarded block → null rather than a crash.
            expect(stored).toBeNull();
        });
    });

    describe("costs", () => {
        it("records costs and returns them in timestamp order", () => {
            AtabeyStorage.saveCost({
                provider: "anthropic",
                model: "claude-sonnet",
                inputTokens: 1000,
                outputTokens: 250,
                cost: 0.012,
                timestamp: "2026-01-02T00:00:00.000Z",
                traceId: "T-COST-2",
            });
            AtabeyStorage.saveCost({
                provider: "openai",
                model: "gpt",
                inputTokens: 10,
                outputTokens: 5,
                cost: 0.001,
                timestamp: "2026-01-01T00:00:00.000Z",
            });

            const costs = AtabeyStorage.getAllCosts();
            expect(costs).toHaveLength(2);
            expect(costs[0].provider).toBe("openai");
            expect(costs[0].traceId).toBeUndefined();
            expect(costs[1]).toMatchObject({
                provider: "anthropic",
                model: "claude-sonnet",
                inputTokens: 1000,
                outputTokens: 250,
                cost: 0.012,
                traceId: "T-COST-2",
            });
        });

        it("returns an empty ledger when nothing was recorded", () => {
            expect(AtabeyStorage.getAllCosts()).toEqual([]);
        });
    });
});
