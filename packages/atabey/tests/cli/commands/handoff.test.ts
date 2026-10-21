import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildAgentHandoff, renderHandoffMarkdown, validateAgentHandoff } from "../../../src/modules/contracts/handoff.js";

describe("Agent Handoff Contract and CLI Integration", () => {
    it("should build and validate a structured agent handoff", () => {
        const handoff = buildAgentHandoff({
            traceId: "T-TEST-001",
            fromAgent: "backend",
            toAgent: "quality",
            taskSummary: "Completed user authentication endpoints",
            workPerformed: "Created service, repository, and integration tests.",
            changedFiles: ["apps/backend/src/auth.ts", "tests/auth.test.ts"],
            nextSteps: ["Run dual-axis quality review", "Execute security scan"]
        });

        const validation = validateAgentHandoff(handoff);
        expect(validation.ok).toBe(true);

        const markdown = renderHandoffMarkdown(handoff);
        expect(markdown).toContain("### Handoff backend → quality");
        expect(markdown).toContain("T-TEST-001");
        expect(markdown).toContain("apps/backend/src/auth.ts");
        expect(markdown).toContain("Run dual-axis quality review");
    });
});
