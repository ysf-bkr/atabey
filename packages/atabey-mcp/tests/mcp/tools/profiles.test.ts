import { describe, expect, it } from "vitest";
import { filterTools, resolveActiveProfile, ESSENTIAL_TOOLS } from "../../../src/mcp/tools/profiles.js";
import { TOOLS } from "../../../src/mcp/tools/definitions.js";

describe("Dynamic Tool Profiles & Filtering Engine", () => {
    it("should return all tools under 'full' profile by default", () => {
        const tools = filterTools(TOOLS);
        expect(tools.length).toBe(TOOLS.length);
    });

    it("should filter to essential tools for local LLMs", () => {
        const tools = filterTools(TOOLS, { profile: "local_llm" });
        expect(tools.length).toBe(ESSENTIAL_TOOLS.size);
        for (const t of tools) {
            expect(ESSENTIAL_TOOLS.has(t.name)).toBe(true);
        }
    });

    it("should automatically detect local provider and apply local_llm profile", () => {
        const profile = resolveActiveProfile({ clientName: "Ollama-Runner/1.0" });
        expect(profile).toBe("local_llm");

        const tools = filterTools(TOOLS, { clientName: "Ollama-Runner/1.0" });
        expect(tools.length).toBe(ESSENTIAL_TOOLS.size);
    });

    it("should filter to coding tools when requested", () => {
        const tools = filterTools(TOOLS, { profile: "coding" });
        expect(tools.length).toBeLessThan(TOOLS.length);
        expect(tools.some((t) => t.name === "read_file")).toBe(true);
        expect(tools.some((t) => t.name === "patch_file")).toBe(true);
        expect(tools.some((t) => t.name === "http_proxy_request")).toBe(false);
    });

    it("should respect explicit disabled tools", () => {
        const tools = filterTools(TOOLS, { disabled: ["run_shell_command", "write_file"] });
        expect(tools.some((t) => t.name === "run_shell_command")).toBe(false);
        expect(tools.some((t) => t.name === "write_file")).toBe(false);
        expect(tools.some((t) => t.name === "read_file")).toBe(true);
    });

    it("should respect explicit allowed tools list", () => {
        const tools = filterTools(TOOLS, { allowed: ["read_file", "write_file"] });
        expect(tools.length).toBe(2);
        expect(tools.map((t) => t.name)).toEqual(["read_file", "write_file"]);
    });
});
