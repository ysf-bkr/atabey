import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../../../src/cli/commands/init.js";
import { ADAPTER_IDS, ADAPTERS } from "../../../src/cli/platforms/index.js";
import {
    FRAMEWORK,
    FRAMEWORK_SUBDIRS,
    MEMORY_FILES,
    NATIVE_AGENT_PATHS, UNIFIED_ADAPTER_SLUG
} from "../../../src/shared/constants.js";

describe("Unified Init (default all adapters)", () => {
    let tempDir: string;
    let prevAntigravityDir: string | undefined;

    beforeEach(() => {
        const workspaceTemp = path.join(process.cwd(), "tests", ".temp-init");
        fs.mkdirSync(workspaceTemp, { recursive: true });
        tempDir = fs.mkdtempSync(path.join(workspaceTemp, "unified-init-"));
        // Keep global Antigravity plugin writes inside the temp workspace so the
        // suite never touches the real ~/.gemini/antigravity-cli directory.
        prevAntigravityDir = process.env.ANTIGRAVITY_GLOBAL_DIR;
        process.env.ANTIGRAVITY_GLOBAL_DIR = path.join(tempDir, ".antigravity-global");
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (prevAntigravityDir === undefined) {
            delete process.env.ANTIGRAVITY_GLOBAL_DIR;
        } else {
            process.env.ANTIGRAVITY_GLOBAL_DIR = prevAntigravityDir;
        }
        vi.restoreAllMocks();
    });

    it("should scaffold all adapters under .agents with native mirrors", async () => {
        await initCommand("gemini", { dryRun: false, yes: true, unified: true });

        expect(fs.existsSync(path.join(tempDir, FRAMEWORK.CORE_DIR, FRAMEWORK_SUBDIRS.MEMORY, MEMORY_FILES.STATE))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, FRAMEWORK.CORE_DIR, FRAMEWORK_SUBDIRS.MESSAGES))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, FRAMEWORK.CORE_DIR, FRAMEWORK_SUBDIRS.MEMORY_GRAPH, MEMORY_FILES.SHARED_FACTS))).toBe(true);

        for (const id of ADAPTER_IDS) {
            const adapter = ADAPTERS[id];
            if (adapter.agentsDir) {
                const expectedAgentsDir = path.join(tempDir, adapter.agentsDir); // This is the actual directory where agents are scaffolded.
                expect(fs.existsSync(expectedAgentsDir)).toBe(true);
            }
        }

        expect(fs.existsSync(path.join(tempDir, FRAMEWORK.UNIFIED_HUB_DIR, FRAMEWORK_SUBDIRS.SKILLS))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "mcp.json"))).toBe(true);

        const config = JSON.parse(fs.readFileSync(path.join(tempDir, FRAMEWORK.CORE_DIR, "config.json"), "utf8"));
        expect(config.unified).toBe(true);
        expect(config.adapters).toEqual(expect.arrayContaining([...ADAPTER_IDS]));

        expect(fs.existsSync(path.join(tempDir, NATIVE_AGENT_PATHS.gemini, "manager.md"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, NATIVE_AGENT_PATHS.cursor, "manager.mdc"))).toBe(true);

        // --yes uses team profile (7 agents)
        const geminiAgents = fs.readdirSync(
            path.join(tempDir, FRAMEWORK.UNIFIED_HUB_DIR, UNIFIED_ADAPTER_SLUG.gemini, "agents"),
        ).filter(f => f.endsWith(".md"));
        expect(geminiAgents.length).toBeGreaterThanOrEqual(7);
    }, 60000);
});
