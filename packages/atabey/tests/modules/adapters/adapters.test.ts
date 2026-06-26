import { describe, expect, it } from "vitest";
import { isAdapterShimFile, resolveAdapter } from "../../../src/cli/platforms/index.js";

describe("Adapters", () => {
    describe("resolveAdapter", () => {
        it("should resolve known adapters", () => {
            const gemini = resolveAdapter("gemini");
            expect(gemini.id).toBe("gemini");

            const claude = resolveAdapter("claude");
            expect(claude.id).toBe("claude");
        });

        it("should resolve fallbacks", () => {
            const unknown = resolveAdapter("unknown-adapter");
            expect(unknown.id).toBe("gemini");
        });

        it("should handle alias names", () => {
            const antigravity = resolveAdapter("antigravity");
            expect(antigravity.id).toBe("antigravity-cli");

            const github = resolveAdapter("github");
            expect(github.id).toBe("codex");
        });
    });

    describe("isAdapterShimFile", () => {
        it("should identify valid shim files", () => {
            expect(isAdapterShimFile("GEMINI.md")).toBe(true);
            expect(isAdapterShimFile("CLAUDE.md")).toBe(true);
            expect(isAdapterShimFile("non-existent.md")).toBe(false);
        });
    });
});
