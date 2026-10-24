import { describe, expect, it } from "vitest";
import { isAdapterShimFile, resolveAdapter } from "../../../src/cli/platforms/index.js";

describe("Adapters", () => {
    describe("resolveAdapter", () => {
        it("should resolve known adapters", () => {
            const claude = resolveAdapter("claude");
            expect(claude.id).toBe("claude");

            const opencode = resolveAdapter("opencode");
            expect(opencode.id).toBe("opencode");
        });

        it("should resolve fallbacks", () => {
            const unknown = resolveAdapter("unknown-adapter");
            expect(unknown.id).toBe("claude");
        });

        it("should handle alias names", () => {
            const antigravity = resolveAdapter("antigravity");
            expect(antigravity.id).toBe("antigravity-cli");

            const github = resolveAdapter("github");
            expect(github.id).toBe("copilot");

            const openCodeAlias = resolveAdapter("open-code");
            expect(openCodeAlias.id).toBe("opencode");
        });
    });

    describe("isAdapterShimFile", () => {
        it("should identify valid shim files", () => {
            expect(isAdapterShimFile("CLAUDE.md")).toBe(true);
            expect(isAdapterShimFile("OPENCODE.md")).toBe(true);
            expect(isAdapterShimFile("GROK.md")).toBe(true);
            expect(isAdapterShimFile("non-existent.md")).toBe(false);
            // Gemini is no longer a supported platform: its shim is not recognized.
            expect(isAdapterShimFile("GEMINI.md")).toBe(false);
        });
    });
});
