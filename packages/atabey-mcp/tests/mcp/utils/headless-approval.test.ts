import { afterEach, describe, expect, it } from "vitest";
import { checkRiskGate, isHeadlessApprovalEnabled } from "../../../src/mcp/utils/human-in-loop.js";

describe("headless CI approval policy", () => {
    afterEach(() => {
        delete process.env.CI;
        delete process.env.ATABEY_HEADLESS_APPROVAL;
        delete process.env.ATABEY_HEADLESS_APPROVAL_MODE;
        delete process.env.ATABEY_HEADLESS_MAX_RISK;
    });

    it("is disabled by default and enabled when CI=true", () => {
        expect(isHeadlessApprovalEnabled()).toBe(false);
        process.env.CI = "true";
        expect(isHeadlessApprovalEnabled()).toBe(true);
        process.env.ATABEY_HEADLESS_APPROVAL = "false";
        expect(isHeadlessApprovalEnabled()).toBe(false);
    });

    it("auto-denies high-risk operations in CI by default (no hang)", () => {
        process.env.CI = "true";
        const gate = checkRiskGate("T-1", "run_shell_command", "@backend", 85, "destructive", {});
        expect(gate?.blocked).toBe(true);
        expect(gate?.message).toContain("[HEADLESS]");
    });

    it("auto-approves bounded risk when policy allows it", () => {
        process.env.CI = "true";
        process.env.ATABEY_HEADLESS_APPROVAL_MODE = "allow";
        process.env.ATABEY_HEADLESS_MAX_RISK = "90";
        const gate = checkRiskGate("T-2", "write_file", "@backend", 70, "bulk", {});
        expect(gate?.blocked).toBe(false);
        expect(gate?.warning).toContain("[HEADLESS]");
    });

    it("does not auto-approve risk above the configured ceiling", () => {
        process.env.CI = "true";
        process.env.ATABEY_HEADLESS_APPROVAL_MODE = "allow";
        process.env.ATABEY_HEADLESS_MAX_RISK = "50";
        const gate = checkRiskGate("T-3", "run_shell_command", "@backend", 95, "critical", {});
        expect(gate?.blocked).toBe(true);
    });
});
