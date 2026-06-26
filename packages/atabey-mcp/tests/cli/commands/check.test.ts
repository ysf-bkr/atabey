import { describe, expect, it } from "vitest";

describe("Check Command", () => {
    it("should export checkCommand function", async () => {
        const mod = await import("../../../src/cli/commands/check.js");
        expect(mod.checkCommand).toBeDefined();
        expect(typeof mod.checkCommand).toBe("function");
    });
});
