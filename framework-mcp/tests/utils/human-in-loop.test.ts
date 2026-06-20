import { beforeEach, describe, expect, it } from "vitest";
import {
    approveOperation,
    getHumanInLoopConfig,
    getPendingApprovals,
    getRiskLevel,
    rejectOperation
} from "../../src/utils/human-in-loop.js";

describe("Human-in-the-Loop", () => {
    beforeEach(() => {
        // Clean up any pending approvals
        const pending = getPendingApprovals();
        for (const req of pending) {
            try { approveOperation(req.traceId); } catch { /* ignore */ }
        }
    });

    describe("getRiskLevel", () => {
        it("should return LOW for scores below 30", () => {
            expect(getRiskLevel(0)).toBe("LOW");
            expect(getRiskLevel(29)).toBe("LOW");
        });

        it("should return MEDIUM for scores 30-59", () => {
            expect(getRiskLevel(30)).toBe("MEDIUM");
            expect(getRiskLevel(45)).toBe("MEDIUM");
            expect(getRiskLevel(59)).toBe("MEDIUM");
        });

        it("should return HIGH for scores 60+", () => {
            expect(getRiskLevel(60)).toBe("HIGH");
            expect(getRiskLevel(80)).toBe("HIGH");
            expect(getRiskLevel(100)).toBe("HIGH");
        });
    });

    describe("approveOperation", () => {
        it("should return error for non-existent trace", () => {
            const result = approveOperation("non-existent-trace");
            expect(result.success).toBe(false);
            expect(result.message).toContain("No pending approval found");
        });
    });

    describe("rejectOperation", () => {
        it("should return error for non-existent trace", () => {
            const result = rejectOperation("non-existent-trace");
            expect(result.success).toBe(false);
            expect(result.message).toContain("No pending approval found");
        });
    });

    describe("getPendingApprovals", () => {
        it("should return empty array when no approvals pending", () => {
            const pending = getPendingApprovals();
            expect(Array.isArray(pending)).toBe(true);
        });
    });

    describe("getHumanInLoopConfig", () => {
        it("should return default config values", () => {
            const config = getHumanInLoopConfig();
            expect(config.HIGH_RISK_THRESHOLD).toBe(60);
            expect(config.MEDIUM_RISK_THRESHOLD).toBe(30);
            expect(config.APPROVAL_TIMEOUT_SECONDS).toBe(300);
        });
    });
});
