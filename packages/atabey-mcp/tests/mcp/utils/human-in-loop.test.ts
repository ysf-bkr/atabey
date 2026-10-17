import { beforeEach, describe, expect, it } from "vitest";
import {
    approveOperation,
    getHumanInLoopConfig,
    getPendingApprovals,
    getMinimumRoleForScore,
    getRiskLevel,
    ROLE_RISK_MAP,
    rejectOperation,
    createApprovalRequest
} from "../../../src/mcp/utils/human-in-loop.js";

/**
 * Human-in-the-Loop + RBAC test suite
 *
 * RBAC enforcement note:
 *   approveOperation() and rejectOperation() read the active role
 *   EXCLUSIVELY from process.env.MCP_USER_ROLE.
 *   The userRole parameter is intentionally ignored to prevent
 *   AI privilege escalation (Claude Code, Gemini, Cursor cannot
 *   bypass the gate by passing {userRole: "admin"} in tool args).
 */
describe("Human-in-the-Loop", () => {
    // Helper to set env role and clean up after each test
    function withRole(role: string, fn: () => void) {
        const prev = process.env.MCP_USER_ROLE;
        process.env.MCP_USER_ROLE = role;
        try { fn(); } finally {
            if (prev === undefined) delete process.env.MCP_USER_ROLE;
            else process.env.MCP_USER_ROLE = prev;
        }
    }

    beforeEach(() => {
        // Clean up any pending approvals from previous tests
        const pending = getPendingApprovals();
        for (const req of pending) {
            try { approveOperation(req.traceId); } catch { /* ignore */ }
        }
    });

    // ─── getRiskLevel ────────────────────────────────────────────────────────

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

    // ─── ROLE_RISK_MAP & getMinimumRoleForScore ───────────────────────────────

    describe("ROLE_RISK_MAP", () => {
        it("admin can approve up to score 100", () => {
            expect(ROLE_RISK_MAP.admin).toBe(100);
        });

        it("lead can approve up to score 79", () => {
            expect(ROLE_RISK_MAP.lead).toBe(79);
        });

        it("developer can approve up to score 59", () => {
            expect(ROLE_RISK_MAP.developer).toBe(59);
        });

        it("junior cannot approve anything (max = -1)", () => {
            expect(ROLE_RISK_MAP.junior).toBe(-1);
        });

        it("getMinimumRoleForScore: score 80 requires admin", () => {
            expect(getMinimumRoleForScore(80)).toBe("admin");
        });

        it("getMinimumRoleForScore: score 65 requires lead", () => {
            expect(getMinimumRoleForScore(65)).toBe("lead");
        });

        it("getMinimumRoleForScore: score 40 requires developer", () => {
            expect(getMinimumRoleForScore(40)).toBe("developer");
        });
    });

    // ─── approveOperation — RBAC ─────────────────────────────────────────────

    describe("approveOperation — RBAC (4-level hierarchy)", () => {
        it("should return error for non-existent trace", () => {
            const result = approveOperation("non-existent-trace");
            expect(result.success).toBe(false);
            expect(result.message).toContain("No pending approval found");
        });

        it("[CRITICAL: riskScore=85] junior cannot approve — env role respected", () => {
            const { request } = createApprovalRequest("T-RBAC-JUNIOR", "run_command", "@manager", 85, "Dangerous command", {});
            withRole("junior", () => {
                const result = approveOperation("T-RBAC-JUNIOR", request.passcode);
                expect(result.success).toBe(false);
                expect(result.message).toContain("RBAC");
            });
        });

        it("[CRITICAL: riskScore=85] developer cannot approve — needs lead+", () => {
            const { request } = createApprovalRequest("T-RBAC-DEV-HIGH", "run_command", "@manager", 85, "Dangerous command", {});
            withRole("developer", () => {
                const result = approveOperation("T-RBAC-DEV-HIGH", request.passcode);
                expect(result.success).toBe(false);
                expect(result.message).toContain("RBAC");
            });
        });

        it("[HIGH: riskScore=65] lead CAN approve", () => {
            const { request } = createApprovalRequest("T-RBAC-LEAD", "write_file", "@backend", 65, "Risky file write", {});
            withRole("lead", () => {
                const result = approveOperation("T-RBAC-LEAD", request.passcode);
                expect(result.success).toBe(true);
                expect(result.message).toContain("lead");
            });
        });

        it("[MEDIUM: riskScore=40] developer CAN approve", () => {
            const { request } = createApprovalRequest("T-RBAC-DEV-MED", "replace_text", "@frontend", 40, "Medium risk edit", {});
            withRole("developer", () => {
                const result = approveOperation("T-RBAC-DEV-MED", request.passcode);
                expect(result.success).toBe(true);
                expect(result.message).toContain("developer");
            });
        });

        it("[MEDIUM: riskScore=40] junior CANNOT approve", () => {
            const { request } = createApprovalRequest("T-RBAC-JUNIOR-MED", "replace_text", "@frontend", 40, "Medium risk edit", {});
            withRole("junior", () => {
                const result = approveOperation("T-RBAC-JUNIOR-MED", request.passcode);
                expect(result.success).toBe(false);
                expect(result.message).toContain("RBAC");
            });
        });

        it("[CRITICAL] AI-supplied userRole='admin' is IGNORED — env role is used", () => {
            // This is the key AI Governance test: even if an AI agent injects
            // {userRole: "admin"} into the tool args, it must not bypass the gate.
            const { request } = createApprovalRequest("T-RBAC-INJECT", "run_command", "@manager", 85, "Injected role test", {});
            withRole("junior", () => {
                // Pass "admin" as userRole arg — should be ignored
                const result = approveOperation("T-RBAC-INJECT", request.passcode, "admin");
                expect(result.success).toBe(false);
                expect(result.message).toContain("RBAC");
            });
        });

        it("[CRITICAL] admin CAN approve any risk score", () => {
            const { request } = createApprovalRequest("T-RBAC-ADMIN", "run_command", "@manager", 100, "Max risk op", {});
            withRole("admin", () => {
                const result = approveOperation("T-RBAC-ADMIN", request.passcode);
                expect(result.success).toBe(true);
            });
        });
    });

    // ─── approveOperation — Passcode ─────────────────────────────────────────

    describe("approveOperation — Passcode second factor", () => {
        it("should reject approval with wrong passcode", () => {
            createApprovalRequest("T-PASSCODE-1", "write_file", "@backend", 70, "Test", {});
            withRole("lead", () => {
                const result = approveOperation("T-PASSCODE-1", "WRONG");
                expect(result.success).toBe(false);
                expect(result.message).toContain("passcode");
            });
        });
    });

    // ─── rejectOperation — RBAC ──────────────────────────────────────────────

    describe("rejectOperation — RBAC", () => {
        it("should return error for non-existent trace", () => {
            const result = rejectOperation("non-existent-trace");
            expect(result.success).toBe(false);
            expect(result.message).toContain("No pending approval found");
        });

        it("[HIGH risk] junior CANNOT reject a HIGH-risk operation", () => {
            createApprovalRequest("T-REJECT-JUNIOR", "run_command", "@manager", 75, "Critical op", {});
            withRole("junior", () => {
                const result = rejectOperation("T-REJECT-JUNIOR");
                expect(result.success).toBe(false);
                expect(result.message).toContain("RBAC");
            });
        });

        it("[HIGH risk] developer CAN reject a HIGH-risk operation", () => {
            const { request } = createApprovalRequest("T-REJECT-DEV", "run_command", "@backend", 70, "High risk op", {});
            void request; // suppress unused warning
            withRole("developer", () => {
                const result = rejectOperation("T-REJECT-DEV");
                expect(result.success).toBe(true);
                expect(result.message).toContain("developer");
            });
        });

        it("[HIGH risk] AI-supplied userRole param is IGNORED in rejectOperation", () => {
            createApprovalRequest("T-REJECT-INJECT", "run_command", "@manager", 75, "Injected role test", {});
            withRole("junior", () => {
                // Pass "admin" as 2nd arg — should be ignored, junior env role applies
                const result = rejectOperation("T-REJECT-INJECT", "admin");
                expect(result.success).toBe(false);
                expect(result.message).toContain("RBAC");
            });
        });
    });

    // ─── getPendingApprovals ─────────────────────────────────────────────────

    describe("getPendingApprovals", () => {
        it("should return empty array when no approvals pending", () => {
            const pending = getPendingApprovals();
            expect(Array.isArray(pending)).toBe(true);
        });
    });

    // ─── getHumanInLoopConfig ────────────────────────────────────────────────

    describe("getHumanInLoopConfig", () => {
        it("should return default config values", () => {
            const config = getHumanInLoopConfig();
            expect(config.HIGH_RISK_THRESHOLD).toBe(60);
            expect(config.MEDIUM_RISK_THRESHOLD).toBe(30);
            expect(config.APPROVAL_TIMEOUT_SECONDS).toBe(300);
        });
    });
});
