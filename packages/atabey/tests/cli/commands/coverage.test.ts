import { describe, expect, it } from "vitest";

describe("Coverage Command", () => {
    it("should export coverageCommand function", async () => {
        const mod = await import("../../../src/cli/commands/coverage.js");
        expect(mod.coverageCommand).toBeDefined();
        expect(typeof mod.coverageCommand).toBe("function");
    });
});
