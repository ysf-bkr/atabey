import { describe, expect, it } from "vitest";

describe("Lint Command", () => {
    it("should export lintCommand function", async () => {
        const mod = await import("../../../src/cli/commands/lint.js");
        expect(mod.lintCommand).toBeDefined();
        expect(typeof mod.lintCommand).toBe("function");
    });
});
