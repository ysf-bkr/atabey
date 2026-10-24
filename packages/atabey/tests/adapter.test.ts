import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDir, removeTestDir } from "./helpers/temp-dir.js";
import {
    buildMcpServerEntry,
    isAdapterShimFile,
    remapFrameworkContent,
    resolveAdapter,
    scaffoldAgents
} from "../src/cli/platforms/index.js";
import { UI } from "../src/cli/utils/ui.js";
import { MCP } from "../src/shared/constants.js";

describe("CLI Adapters", () => {
    describe("resolveAdapter", () => {
        let uiWarningSpy: any;

        beforeEach(() => {
            uiWarningSpy = vi.spyOn(UI, "warning").mockImplementation(() => {});
        });

        afterEach(() => {
            uiWarningSpy.mockRestore();
        });

        it("should resolve known adapter ID", () => {
            const config = resolveAdapter("claude");
            expect(config.id).toBe("claude");
            expect(uiWarningSpy).not.toHaveBeenCalled();
        });

        it("should map alias 'antigravity' to 'antigravity-cli'", () => {
            const config = resolveAdapter("antigravity");
            expect(config.id).toBe("antigravity-cli");
            expect(uiWarningSpy).not.toHaveBeenCalled();
        });

        it("should map 'copilot', 'github' and 'vscode' to the copilot adapter, not codex", () => {
            // VS Code's MCP format (top-level `servers`) is different from
            // Codex's TOML format; aliasing them would write the wrong file.
            expect(resolveAdapter("copilot").id).toBe("copilot");
            expect(resolveAdapter("github").id).toBe("copilot");
            expect(resolveAdapter("vscode").id).toBe("copilot");
            expect(uiWarningSpy).not.toHaveBeenCalled();
        });

        it("should map local LLM aliases to 'local'", () => {
            expect(resolveAdapter("ollama").id).toBe("local");
            expect(resolveAdapter("vllm").id).toBe("local");
            expect(resolveAdapter("lmstudio").id).toBe("local");
        });

        it("should fallback to claude and log warning for unknown adapter", () => {
            const config = resolveAdapter("unknown-adapter");
            expect(config.id).toBe("claude");
            expect(uiWarningSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown adapter \"unknown-adapter\""));
        });

        it("should warn and fallback to claude for the removed gemini platform", () => {
            const config = resolveAdapter("gemini");
            expect(config.id).toBe("claude");
            expect(uiWarningSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown adapter \"gemini\""));
        });
    });

    describe("isAdapterShimFile", () => {
        it("should identify shim files correctly", () => {
            // claude shim file is CLAUDE.md
            expect(isAdapterShimFile("CLAUDE.md")).toBe(true);
            expect(isAdapterShimFile("unknown.md")).toBe(false);
        });
    });

    describe("remapFrameworkContent", () => {
        let tempDir: string;
        let cwdSpy: ReturnType<typeof vi.spyOn>;

        beforeEach(() => {
            tempDir = createTestDir("adapter-remap-");
            cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
        });

        afterEach(() => {
            cwdSpy.mockRestore();
            removeTestDir(tempDir);
        });

        it("should map simple tokens {{FRAMEWORK_DIR}} and {{ADAPTER}}", () => {
            const content = "Framework: {{FRAMEWORK_DIR}} / Adapter: {{ADAPTER}}";
            const result = remapFrameworkContent(content, ".claude", "claude");
            expect(result).toBe("Framework: .claude / Adapter: claude");
        });

        it("should map folder names and paths dynamically", () => {
            const content = "Source is .atabey/agents/ and .atabey/knowledge/";
            const result = remapFrameworkContent(content, ".agents", "antigravity-cli");
            // For antigravity-cli: agents -> agents, knowledge -> rules
            expect(result).toBe("Source is .agents/agents/ and .agents/rules/");
        });

        it("should map directory paths based on config.json paths if file exists", () => {
            const frameworkDir = ".claude";
            const claudeDir = path.join(tempDir, frameworkDir);
            fs.mkdirSync(claudeDir, { recursive: true });

            const config = {
                paths: {
                    backend: "server",
                    frontend: "client",
                    docs: "wiki",
                    tests: "specs"
                }
            };
            fs.writeFileSync(path.join(claudeDir, "config.json"), JSON.stringify(config));

            const content = "{{BACKEND_DIR}} / {{FRONTEND_DIR}} / {{DOCS_DIR}} / {{TESTS_DIR}}";
            const result = remapFrameworkContent(content, frameworkDir, "claude");
            expect(result).toBe("server / client / wiki / specs");
        });
    });

    describe("buildMcpServerEntry", () => {
        it("should build correct entry object", () => {
            const entry = buildMcpServerEntry("/path/to/project");
            expect(entry.command).toBe("npx");
            expect(entry.args).toEqual(["-y", "atabey-mcp"]);
            expect(entry.env[MCP.PROJECT_ROOT_ENV]).toBe("/path/to/project");
            expect(entry.env[MCP.TRANSPORT_ENV]).toBe(MCP.TRANSPORT_STDIO);
            expect(entry.env.ATABEY_AUTO_START_ORCHESTRATOR).toBe("true");
        });
    });

    describe("scaffoldAgents", () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = createTestDir("adapter-scaffold-");
        });

        afterEach(() => {
            removeTestDir(tempDir);
        });

        it("should respect dryRun and not create files", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            scaffoldAgents(tempDir, "claude", true);

            const agentsDir = path.join(tempDir, ".claude/agents");
            expect(fs.existsSync(agentsDir)).toBe(false);
            consoleWarnSpy.mockRestore();
        });

        it("should scaffold agents successfully on normal mode", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            scaffoldAgents(tempDir, "claude", false);

            const agentsDir = path.join(tempDir, ".claude/agents");
            expect(fs.existsSync(agentsDir)).toBe(true);
            const files = fs.readdirSync(agentsDir);
            expect(files.length).toBeGreaterThan(0);
            expect(files).toContain("manager.md");
            // Claude agent markdown carries YAML frontmatter for discoverability.
            const manager = fs.readFileSync(path.join(agentsDir, "manager.md"), "utf8");
            expect(manager.startsWith("---\n")).toBe(true);
            expect(manager).toContain("name: manager");

            consoleWarnSpy.mockRestore();
        });
    });
});
