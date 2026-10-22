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
import { AtabeyStorage } from "../../../src/shared/storage.js";
import { createTestDir } from "../../helpers/temp-dir.js";

describe("Unified Init (`init all` — every supported AI)", () => {
    let tempDir: string;
    let prevAntigravityDir: string | undefined;

    beforeEach(() => {
        AtabeyStorage.reset();
        tempDir = createTestDir("unified-init-");
        process.env.ATABEY_TEST_DIR = path.join(tempDir, ".atabey");
        // Keep global Antigravity plugin writes inside the temp workspace so the
        // suite never touches the real ~/.gemini/antigravity-cli directory.
        prevAntigravityDir = process.env.ANTIGRAVITY_GLOBAL_DIR;
        process.env.ANTIGRAVITY_GLOBAL_DIR = path.join(tempDir, ".antigravity-global");
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        AtabeyStorage.reset();
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (prevAntigravityDir === undefined) {
            delete process.env.ANTIGRAVITY_GLOBAL_DIR;
        } else {
            process.env.ANTIGRAVITY_GLOBAL_DIR = prevAntigravityDir;
        }
        vi.restoreAllMocks();
    });

    it("should scaffold all adapters under .agents with native mirrors", async () => {
        await initCommand("all", { dryRun: false, yes: true });

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
        expect(fs.existsSync(path.join(tempDir, "AGENTS.md"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "CLAUDE.md"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "GROK.md"))).toBe(true);
        // Gemini is no longer a supported platform: its shim must not be generated.
        expect(fs.existsSync(path.join(tempDir, "GEMINI.md"))).toBe(false);

        // Root .mcp.json is the single root-level MCP config (VS Code / Claude / Codex standard).
        expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(true);
        const mcpCfg = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
        expect(mcpCfg.mcpServers.atabey.env.MCP_TRANSPORT).toBe("stdio");
        expect(mcpCfg.mcpServers.atabey.env.ATABEY_PROJECT_ROOT).toBe(tempDir);
        expect(mcpCfg.mcpServers.atabey.command).toBe("npx");
        // Legacy duplicate MCP configs must NOT exist.
        expect(fs.existsSync(path.join(tempDir, "mcp.json"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".claude", "mcp_config.json"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".vscode", "mcp.json"))).toBe(false);
        expect(fs.existsSync(path.join(tempDir, ".opencode", "mcp_config.json"))).toBe(false);

        // Platform-native MCP configs: exactly one file per platform.
        expect(fs.existsSync(path.join(tempDir, ".grok", "mcp_config.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".cursor", "mcp.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, ".agents", "mcp_config.json"))).toBe(true); // Antigravity
        expect(fs.existsSync(path.join(tempDir, ".atabey", "mcp_config.json"))).toBe(true); // Local LLM
        expect(fs.existsSync(path.join(tempDir, "opencode.json"))).toBe(true); // OpenCode

        const config = JSON.parse(fs.readFileSync(path.join(tempDir, FRAMEWORK.CORE_DIR, "config.json"), "utf8"));
        expect(config.unified).toBe(true);
        expect(config.adapters).toEqual(expect.arrayContaining([...ADAPTER_IDS]));
        expect(config.setup).toBe("standard");

        expect(fs.existsSync(path.join(tempDir, NATIVE_AGENT_PATHS.claude, "manager.md"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, NATIVE_AGENT_PATHS.cursor, "manager.mdc"))).toBe(true);

        // Canonical setup scaffolds every specialist (13 agents) per adapter.
        const claudeAgents = fs.readdirSync(
            path.join(tempDir, FRAMEWORK.UNIFIED_HUB_DIR, UNIFIED_ADAPTER_SLUG.claude, "agents"),
        ).filter(f => f.endsWith(".md"));
        expect(claudeAgents.length).toBe(13);

        // Skills use the discoverable skills/<slug>/SKILL.md directory format.
        const skillsDir = path.join(tempDir, FRAMEWORK.UNIFIED_HUB_DIR, FRAMEWORK_SUBDIRS.SKILLS);
        const fileSystemSkill = path.join(skillsDir, "file-system", "SKILL.md");
        expect(fs.existsSync(fileSystemSkill)).toBe(true);
        const skillContent = fs.readFileSync(fileSystemSkill, "utf8");
        expect(skillContent.startsWith("---\n")).toBe(true);
        expect(skillContent).toContain("name: File System");

        // Bootstrap trace T-001 opens the first active task in project memory.
        const tasks = AtabeyStorage.getTasks();
        expect(tasks.some(t => t.traceId === "T-001")).toBe(true);
    }, 60000);
});
