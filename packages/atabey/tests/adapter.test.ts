import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
            const config = resolveAdapter("gemini");
            expect(config.id).toBe("gemini");
            expect(uiWarningSpy).not.toHaveBeenCalled();
        });

        it("should map alias 'antigravity' to 'antigravity-cli'", () => {
            const config = resolveAdapter("antigravity");
            expect(config.id).toBe("antigravity-cli");
            expect(uiWarningSpy).not.toHaveBeenCalled();
        });

        it("should map aliases 'copilot' and 'github' to 'codex'", () => {
            const config1 = resolveAdapter("copilot");
            expect(config1.id).toBe("codex");

            const config2 = resolveAdapter("github");
            expect(config2.id).toBe("codex");

            expect(uiWarningSpy).not.toHaveBeenCalled();
        });

        it("should fallback to gemini and log warning for unknown adapter", () => {
            const config = resolveAdapter("unknown-adapter");
            expect(config.id).toBe("gemini");
            expect(uiWarningSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown adapter \"unknown-adapter\""));
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
        const tempDir = path.join(process.cwd(), "tests", "temp-adapter-test");
        let cwdSpy: any;

        beforeEach(() => {
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
        });

        afterEach(() => {
            cwdSpy.mockRestore();
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("should map simple tokens {{FRAMEWORK_DIR}} and {{ADAPTER}}", () => {
            const content = "Framework: {{FRAMEWORK_DIR}} / Adapter: {{ADAPTER}}";
            const result = remapFrameworkContent(content, ".gemini", "gemini");
            expect(result).toBe("Framework: .gemini / Adapter: gemini");
        });

        it("should map folder names and paths dynamically", () => {
            const content = "Source is .atabey/agents/ and .atabey/knowledge/";
            const result = remapFrameworkContent(content, ".gemini", "antigravity-cli");
            // For antigravity-cli: agents -> agents, knowledge -> rules
            expect(result).toBe("Source is .gemini/agents/ and .gemini/rules/");
        });

        it("should map directory paths based on config.json paths if file exists", () => {
            const frameworkDir = ".gemini";
            const geminiDir = path.join(tempDir, frameworkDir);
            fs.mkdirSync(geminiDir, { recursive: true });

            const config = {
                paths: {
                    backend: "server",
                    frontend: "client",
                    docs: "wiki",
                    tests: "specs"
                }
            };
            fs.writeFileSync(path.join(geminiDir, "config.json"), JSON.stringify(config));

            const content = "{{BACKEND_DIR}} / {{FRONTEND_DIR}} / {{DOCS_DIR}} / {{TESTS_DIR}}";
            const result = remapFrameworkContent(content, frameworkDir, "gemini");
            expect(result).toBe("server / client / wiki / specs");
        });
    });

    describe("buildMcpServerEntry", () => {
        it("should build correct entry object", () => {
            const entry = buildMcpServerEntry("/path/to/project");
            expect(entry.command).toBe("node");
            // In tests, /path/to/project != packageRoot, so it falls back to node_modules path
            expect(entry.args[0]).toMatch(/node_modules\/atabey-mcp\/dist\/atabey-mcp\/src\/mcp\/index\.js|framework-mcp\/dist\/index\.js/);
            expect(entry.env[MCP.PROJECT_ROOT_ENV]).toBe("/path/to/project");
        });
    });

    describe("scaffoldAgents", () => {
        const tempDir = path.join(process.cwd(), "tests", "temp-scaffold-test");

        beforeEach(() => {
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
        });

        afterEach(() => {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
        });

        it("should respect dryRun and not create files", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            scaffoldAgents(tempDir, "gemini", true);

            const agentsDir = path.join(tempDir, ".gemini/agents");
            expect(fs.existsSync(agentsDir)).toBe(false);
            consoleWarnSpy.mockRestore();
        });

        it("should scaffold agents successfully on normal mode", () => {
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            scaffoldAgents(tempDir, "gemini", false);

            const agentsDir = path.join(tempDir, ".gemini/agents");
            expect(fs.existsSync(agentsDir)).toBe(true);
            const files = fs.readdirSync(agentsDir);
            expect(files.length).toBeGreaterThan(0);
            expect(files).toContain("manager.md");

            consoleWarnSpy.mockRestore();
        });
    });
});
