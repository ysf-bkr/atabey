import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    detectActiveAgentLayouts,
    findAgentInstruction,
    getUnifiedAgentLayoutBases,
    mirrorUnifiedAgentsToNative,
    resolveAgentsDir,
    UNIFIED_ADAPTER_SLUG,
} from "../../src/cli/platforms/paths.js";
import { scaffoldAgents } from "../../src/cli/platforms/scaffold.js";

describe("Adapter Paths", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-paths-test-"));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe("resolveAgentsDir", () => {
        it("should use adapter-specific dir in legacy mode", () => {
            expect(resolveAgentsDir("gemini", false).agentsDir).toBe(".gemini/agents");
            expect(resolveAgentsDir("codex", false).agentsDir).toBe(".agents/instructions");
        });

        it("should use per-platform subtree under unified hub in unified mode", () => {
            expect(resolveAgentsDir("gemini", true).agentsDir).toBe(".agents/gemini/agents");
            expect(resolveAgentsDir("cursor", true).agentsDir).toBe(".agents/cursor/rules");
            expect(resolveAgentsDir("codex", true).agentsDir).toBe(".agents/codex/instructions");
            expect(resolveAgentsDir("antigravity-cli", true).agentsDir).toBe(".agents/agents");
        });

        it("should expose a layout base for every adapter slug", () => {
            const bases = getUnifiedAgentLayoutBases();
            expect(bases).toHaveLength(7);
            expect(bases.some((b) => b.includes(UNIFIED_ADAPTER_SLUG.gemini))).toBe(true);
        });
    });

    describe("findAgentInstruction", () => {
        it("should find unified gemini agent", () => {
            const dir = path.join(tempDir, ".agents/gemini/agents");
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, "manager.md"), "# manager");

            expect(findAgentInstruction(tempDir, "manager")).toBe(".agents/gemini/agents/manager.md");
        });

        it("should find nested antigravity agent.json", () => {
            const agentDir = path.join(tempDir, ".agents/agents/manager");
            fs.mkdirSync(agentDir, { recursive: true });
            fs.writeFileSync(path.join(agentDir, "agent.json"), "{}");

            expect(findAgentInstruction(tempDir, "manager")).toBe(".agents/agents/manager/agent.json");
        });
    });

    describe("mirrorUnifiedAgentsToNative", () => {
        it("should copy unified agents to native gemini path", () => {
            scaffoldAgents(tempDir, "gemini", false, ["manager"]);
            mirrorUnifiedAgentsToNative(tempDir, "gemini");

            expect(fs.existsSync(path.join(tempDir, ".gemini/agents/manager.md"))).toBe(true);
        });
    });

    describe("detectActiveAgentLayouts", () => {
        it("should list unified and legacy layouts", () => {
            fs.mkdirSync(path.join(tempDir, ".agents/claude/agents"), { recursive: true });
            fs.mkdirSync(path.join(tempDir, ".gemini/agents"), { recursive: true });

            const layouts = detectActiveAgentLayouts(tempDir);
            expect(layouts).toContain(".agents/claude/agents");
            expect(layouts).toContain(".gemini/agents");
        });
    });
});
