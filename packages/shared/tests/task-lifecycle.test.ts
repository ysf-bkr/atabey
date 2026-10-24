import { describe, expect, it } from "vitest";
import {
    LIFECYCLE_ALLOWED_TRANSITIONS,
    validateHandoverPayload,
    validateLifecycleTransition,
    type TransitionContext,
} from "../src/modules/lifecycle/task-lifecycle.js";

/**
 * The task lifecycle is an exported library primitive (not wired into the
 * default MCP pipeline). Its gates are the reason it exists, so each veto is
 * asserted explicitly rather than only the happy path.
 */

const ctx = (over: Partial<TransitionContext> = {}): TransitionContext => ({
    taskId: "TASK-1",
    traceId: "T-001",
    currentAgent: "@quality",
    ...over,
});

describe("lifecycle transitions", () => {
    it("allows the happy path through every stage", () => {
        const path = ["SPEC", "PLAN", "IMPLEMENT", "TEST", "REVIEW", "MERGE", "DONE"] as const;
        for (let i = 0; i < path.length - 1; i++) {
            const res = validateLifecycleTransition(path[i], path[i + 1], ctx());
            expect(res.allowed, `${path[i]} → ${path[i + 1]}: ${res.reason}`).toBe(true);
        }
    });

    it("rejects an illegal jump", () => {
        const res = validateLifecycleTransition("SPEC", "DONE", ctx());
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/Illegal state transition/);
    });

    it("treats DONE as terminal", () => {
        expect(LIFECYCLE_ALLOWED_TRANSITIONS.DONE).toEqual([]);
        expect(validateLifecycleTransition("DONE", "DONE", ctx()).allowed).toBe(false);
    });

    it("allows recovery from BLOCKED", () => {
        for (const target of LIFECYCLE_ALLOWED_TRANSITIONS.BLOCKED) {
            expect(validateLifecycleTransition("BLOCKED", target, ctx()).allowed).toBe(true);
        }
    });

    it("blocks IMPLEMENT → TEST when the AST is invalid", () => {
        const res = validateLifecycleTransition("IMPLEMENT", "TEST", ctx({ astValid: false }));
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/AST compliance violations/);
    });

    it("requires tests to pass before REVIEW", () => {
        expect(validateLifecycleTransition("TEST", "REVIEW", ctx({ testsPassed: false })).allowed).toBe(false);
        expect(validateLifecycleTransition("TEST", "REVIEW", ctx({ testExitCode: 1 })).allowed).toBe(false);
        expect(validateLifecycleTransition("TEST", "REVIEW", ctx({ testExitCode: 0 })).allowed).toBe(true);
    });

    it("enforces the coverage floor when both values are supplied", () => {
        const res = validateLifecycleTransition(
            "TEST",
            "REVIEW",
            ctx({ coveragePct: 70, minCoveragePct: 80 }),
        );
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/coverage 70% is below required 80%/);

        expect(validateLifecycleTransition("TEST", "REVIEW", ctx({ coveragePct: 85, minCoveragePct: 80 })).allowed).toBe(true);
    });

    it("does not enforce coverage when the floor is unknown", () => {
        expect(validateLifecycleTransition("TEST", "REVIEW", ctx({ coveragePct: 5 })).allowed).toBe(true);
    });

    it("prevents an author from approving its own review", () => {
        const res = validateLifecycleTransition(
            "REVIEW",
            "MERGE",
            ctx({ currentAgent: "@backend", authorAgent: "@backend" }),
        );
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/Maker-Checker Violation/);
    });

    it("normalises the @ prefix when comparing author and reviewer", () => {
        const res = validateLifecycleTransition(
            "REVIEW",
            "DONE",
            ctx({ currentAgent: "backend", authorAgent: "@backend" }),
        );
        expect(res.allowed).toBe(false);
    });

    it("respects an explicit non-approval", () => {
        const res = validateLifecycleTransition("REVIEW", "DONE", ctx({ reviewApproved: false }));
        expect(res.allowed).toBe(false);
        expect(res.reason).toMatch(/explicit non-approval/);
    });

    it("allows REVIEW → IMPLEMENT to send work back", () => {
        expect(validateLifecycleTransition("REVIEW", "IMPLEMENT", ctx()).allowed).toBe(true);
    });
});

describe("handover payload validation", () => {
    const valid = {
        traceId: "T-001",
        taskId: "TASK-1",
        fromAgent: "@backend",
        toAgent: "@quality",
        lifecycleState: "TEST",
        summary: "Implemented login endpoint",
        filesModified: ["src/auth.ts"],
        testsExecuted: [{ testFile: "tests/auth.test.ts", passed: true }],
        openIssues: [],
        recommendedAction: "Run review",
        timestamp: new Date().toISOString(),
    };

    it("accepts a well-formed payload", () => {
        expect(validateHandoverPayload(valid)).toEqual({ valid: true, errors: [] });
    });

    it("rejects non-objects", () => {
        expect(validateHandoverPayload(null).valid).toBe(false);
        expect(validateHandoverPayload("text").valid).toBe(false);
        expect(validateHandoverPayload(undefined).valid).toBe(false);
    });

    it("reports every missing required field", () => {
        const res = validateHandoverPayload({});
        expect(res.valid).toBe(false);
        for (const field of ["traceId", "fromAgent", "toAgent", "lifecycleState", "summary", "recommendedAction"]) {
            expect(res.errors.join("\n")).toContain(`'${field}'`);
        }
    });

    it("rejects non-array list fields", () => {
        const res = validateHandoverPayload({ ...valid, filesModified: "src/auth.ts" });
        expect(res.valid).toBe(false);
        expect(res.errors.join("\n")).toContain("'filesModified'");
    });

    it("rejects an empty string where a string is required", () => {
        const res = validateHandoverPayload({ ...valid, summary: "" });
        expect(res.valid).toBe(false);
    });
});
