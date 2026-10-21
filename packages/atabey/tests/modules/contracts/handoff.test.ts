import { describe, expect, it } from "vitest";
import {
    AgentHandoffSchema,
    buildAgentHandoff,
    decodeHandoffMessage,
    encodeHandoffMessage,
    renderHandoffMarkdown,
    validateAgentHandoff,
} from "../../../src/modules/contracts/handoff.js";

describe("Agent Handoff Contract (B2)", () => {
    const validHandoff = buildAgentHandoff({
        traceId: "T-001",
        fromAgent: "@backend",
        toAgent: "@quality",
        taskSummary: "Implement the rate limiter middleware",
        workPerformed: "Added token-bucket limiter in src/middleware/rate-limit.ts.",
        changedFiles: ["src/middleware/rate-limit.ts", "src/middleware/index.ts"],
        testsRun: [{ command: "npm test -- rate-limit", passed: 12, failed: 0 }],
        openIssues: [{ description: "Redis fallback not yet wired", severity: "MEDIUM" }],
        nextSteps: ["Verify coverage threshold", "Run the full suite"],
        status: "HANDOFF",
    });

    describe("schema validation", () => {
        it("accepts a complete, well-formed handoff", () => {
            const result = validateAgentHandoff(validHandoff);
            expect(result.ok).toBe(true);
        });

        it("rejects a handoff missing required fields", () => {
            const result = validateAgentHandoff({ traceId: "T-001" });
            expect(result.ok).toBe(false);
            if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
        });

        it("rejects unknown fields (strict contract)", () => {
            const result = AgentHandoffSchema.safeParse({ ...validHandoff, extra: "nope" });
            expect(result.success).toBe(false);
        });

        it("rejects an invalid status enum value", () => {
            const result = AgentHandoffSchema.safeParse({ ...validHandoff, status: "DONE?" });
            expect(result.success).toBe(false);
        });

        it("rejects negative test counts", () => {
            const result = AgentHandoffSchema.safeParse({
                ...validHandoff,
                testsRun: [{ command: "x", passed: -1, failed: 0 }],
            });
            expect(result.success).toBe(false);
        });
    });

    describe("message encoding round-trip", () => {
        it("encodes and decodes a handoff message losslessly", () => {
            const encoded = encodeHandoffMessage(validHandoff);
            const decoded = decodeHandoffMessage(encoded);
            expect(decoded).toEqual(validHandoff);
        });

        it("returns null for legacy free-text messages", () => {
            expect(decodeHandoffMessage("[AGENT:backend] Task acknowledged.")).toBeNull();
        });

        it("returns null for plain JSON without the handoff marker", () => {
            expect(decodeHandoffMessage(JSON.stringify({ task: "something" }))).toBeNull();
        });

        it("returns null for a handoff payload that fails validation", () => {
            const forged = JSON.stringify({ type: "HANDOFF", handoff: { traceId: 42 } });
            expect(decodeHandoffMessage(forged)).toBeNull();
        });
    });

    describe("markdown rendering", () => {
        it("renders the summary, files, tests, issues and next steps", () => {
            const md = renderHandoffMarkdown(validHandoff);
            expect(md).toContain("@backend → @quality");
            expect(md).toContain("rate-limit.ts");
            expect(md).toContain("12 passed, 0 failed");
            expect(md).toContain("[MEDIUM] Redis fallback not yet wired");
            expect(md).toContain("Verify coverage threshold");
        });
    });

    describe("builder defaults", () => {
        it("defaults list fields to empty and status to HANDOFF", () => {
            const h = buildAgentHandoff({
                traceId: "T-002",
                fromAgent: "quality",
                toAgent: "manager",
                taskSummary: "Audit the module",
                workPerformed: "",
            });
            expect(h.changedFiles).toEqual([]);
            expect(h.testsRun).toEqual([]);
            expect(h.openIssues).toEqual([]);
            expect(h.nextSteps).toEqual([]);
            expect(h.status).toBe("HANDOFF");
            expect(h.handoffAt).toBeTruthy();
        });
    });
});
