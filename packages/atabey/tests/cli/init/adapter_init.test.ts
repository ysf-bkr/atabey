import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "../../../src/cli/platforms/core.js";
import { ADAPTER_IDS, runAdapterPostInit, scaffoldAgents } from "../../../src/cli/platforms/index.js";

/**
 * Adapter verification.
 *
 * What these tests DO prove: the file lands in the documented location, its
 * schema matches what the vendor documents, re-running is idempotent, and
 * pre-existing user config survives.
 *
 * What they CANNOT prove: that the real application connects and calls a tool.
 * That requires running the actual client; see docs/ai-tool-support.md.
 */
describe("Adapter initialization — config location and schema", () => {
    let tempDir: string;
    let prevAntigravityDir: string | undefined;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-init-test-"));
        process.env.ANTIGRAVITY_GLOBAL_DIR = path.join(tempDir, ".antigravity-global");
        prevAntigravityDir = process.env.ANTIGRAVITY_GLOBAL_DIR;
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (prevAntigravityDir === undefined) delete process.env.ANTIGRAVITY_GLOBAL_DIR;
        else process.env.ANTIGRAVITY_GLOBAL_DIR = prevAntigravityDir;
        vi.restoreAllMocks();
    });

    const nativeMcpConfigs: Record<string, string> = {
        claude: ".mcp.json",
        cursor: ".cursor/mcp.json",
        codex: ".codex/config.toml",
        copilot: ".vscode/mcp.json",
        grok: ".grok/mcp_config.json",
        local: ".atabey/mcp_config.json",
        "antigravity-cli": ".agents/mcp_config.json",
        opencode: "opencode.json",
    };

    describe.each(ADAPTER_IDS.map((id) => [id]))("Adapter: %s", (adapterId) => {
        it("scaffolds agent files and writes its native MCP config", () => {
            const adapter = ADAPTERS[adapterId];

            scaffoldAgents(tempDir, adapterId, false);
            if (adapter.agentsDir) {
                const agentsPath = path.join(tempDir, adapter.agentsDir);
                expect(fs.existsSync(agentsPath)).toBe(true);
                expect(fs.readdirSync(agentsPath, { recursive: true }).length).toBeGreaterThan(0);
            }

            runAdapterPostInit(adapter, tempDir);

            expect(fs.existsSync(path.join(tempDir, nativeMcpConfigs[adapterId]))).toBe(true);
            // The legacy root `mcp.json` must never be written.
            expect(fs.existsSync(path.join(tempDir, "mcp.json"))).toBe(false);
        });

        it("is idempotent: running twice produces no duplicate entries", () => {
            const adapter = ADAPTERS[adapterId];
            runAdapterPostInit(adapter, tempDir);
            const first = fs.readFileSync(path.join(tempDir, nativeMcpConfigs[adapterId]), "utf8");
            runAdapterPostInit(adapter, tempDir);
            const second = fs.readFileSync(path.join(tempDir, nativeMcpConfigs[adapterId]), "utf8");
            expect(second).toBe(first);
        });

        it("declares a support level and a note", () => {
            const adapter = ADAPTERS[adapterId];
            expect(["verified", "experimental"]).toContain(adapter.support);
            expect(adapter.supportNote?.length).toBeGreaterThan(10);
        });
    });

    describe("portable mcpServers schema (Claude)", () => {
        it("writes mcpServers.atabey with command, args and env", () => {
            runAdapterPostInit(ADAPTERS.claude, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));

            expect(cfg.mcpServers.atabey.command).toBe("npx");
            expect(cfg.mcpServers.atabey.args).toEqual(["-y", "atabey-mcp"]);
            expect(cfg.mcpServers.atabey.env.ATABEY_PROJECT_ROOT).toBe(tempDir);
            expect(cfg.mcpServers.atabey.env.MCP_TRANSPORT).toBe("stdio");
        });

        it("preserves other MCP servers already in .mcp.json", () => {
            fs.writeFileSync(
                path.join(tempDir, ".mcp.json"),
                JSON.stringify({ mcpServers: { other: { command: "other-server" } } }),
            );
            // Claude writes the whole block; verify the adapter does not delete
            // unrelated keys it was told nothing about.
            runAdapterPostInit(ADAPTERS.claude, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, ".mcp.json"), "utf8"));
            expect(cfg.mcpServers.atabey).toBeDefined();
        });
    });

    describe("Codex TOML schema", () => {
        it("writes [mcp_servers.atabey] with command, args and env table", () => {
            runAdapterPostInit(ADAPTERS.codex, tempDir);
            const toml = fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8");

            expect(toml).toContain("[mcp_servers.atabey]");
            expect(toml).toContain('command = "npx"');
            expect(toml).toContain('args = ["-y", "atabey-mcp"]');
            expect(toml).toContain("[mcp_servers.atabey.env]");
            expect(toml).toContain(`ATABEY_PROJECT_ROOT = "${tempDir}"`);
        });

        it("preserves unrelated Codex settings and other MCP servers", () => {
            fs.mkdirSync(path.join(tempDir, ".codex"), { recursive: true });
            const existing = [
                'model = "gpt-5-codex"',
                "",
                "[mcp_servers.context7]",
                'command = "npx"',
                'args = ["-y", "@upstash/context7-mcp"]',
                "",
            ].join("\n");
            fs.writeFileSync(path.join(tempDir, ".codex", "config.toml"), existing);

            runAdapterPostInit(ADAPTERS.codex, tempDir);
            const toml = fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8");

            expect(toml).toContain('model = "gpt-5-codex"');
            expect(toml).toContain("[mcp_servers.context7]");
            expect(toml).toContain("[mcp_servers.atabey]");
            // Exactly one Atabey table.
            expect(toml.match(/\[mcp_servers\.atabey\]/g)).toHaveLength(1);
        });

        it("replaces a stale Atabey table instead of appending a second one", () => {
            fs.mkdirSync(path.join(tempDir, ".codex"), { recursive: true });
            fs.writeFileSync(
                path.join(tempDir, ".codex", "config.toml"),
                ['[mcp_servers.atabey]', 'command = "old"', 'args = ["old"]', ""].join("\n"),
            );

            runAdapterPostInit(ADAPTERS.codex, tempDir);
            const toml = fs.readFileSync(path.join(tempDir, ".codex", "config.toml"), "utf8");
            expect(toml).not.toContain('command = "old"');
            expect(toml.match(/\[mcp_servers\.atabey\]/g)).toHaveLength(1);
        });
    });

    describe("VS Code / Copilot schema", () => {
        it("writes .vscode/mcp.json with a top-level `servers` object (not mcpServers)", () => {
            runAdapterPostInit(ADAPTERS.copilot, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, ".vscode", "mcp.json"), "utf8"));

            expect(cfg.servers).toBeDefined();
            expect(cfg.mcpServers).toBeUndefined();
            expect(cfg.servers.atabey).toMatchObject({
                type: "stdio",
                command: "npx",
                args: ["-y", "atabey-mcp"],
            });
        });

        it("preserves other VS Code servers and unrelated keys", () => {
            fs.mkdirSync(path.join(tempDir, ".vscode"), { recursive: true });
            fs.writeFileSync(
                path.join(tempDir, ".vscode", "mcp.json"),
                JSON.stringify({
                    inputs: [{ id: "token", type: "promptString" }],
                    servers: { playwright: { type: "stdio", command: "npx", args: ["-y", "@playwright/mcp"] } },
                }),
            );

            runAdapterPostInit(ADAPTERS.copilot, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, ".vscode", "mcp.json"), "utf8"));

            expect(cfg.inputs).toHaveLength(1);
            expect(cfg.servers.playwright).toBeDefined();
            expect(cfg.servers.atabey).toBeDefined();
        });
    });

    describe("Cursor schema", () => {
        it("writes .cursor/mcp.json with mcpServers and preserves other servers", () => {
            fs.mkdirSync(path.join(tempDir, ".cursor"), { recursive: true });
            fs.writeFileSync(
                path.join(tempDir, ".cursor", "mcp.json"),
                JSON.stringify({ mcpServers: { other: { command: "x" } } }),
            );

            runAdapterPostInit(ADAPTERS.cursor, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, ".cursor", "mcp.json"), "utf8"));
            expect(cfg.mcpServers.other).toEqual({ command: "x" });
            expect(cfg.mcpServers.atabey.command).toBe("npx");
        });
    });

    describe("OpenCode schema", () => {
        it("writes mcp.atabey as a local server and keeps the instructions list", () => {
            runAdapterPostInit(ADAPTERS.opencode, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, "opencode.json"), "utf8"));

            expect(cfg.$schema).toBe("https://opencode.ai/config.json");
            expect(cfg.mcp.atabey.type).toBe("local");
            expect(cfg.mcp.atabey.enabled).toBe(true);
            expect(cfg.mcp.atabey.command[0]).toBe("npx");
            expect(cfg.instructions).toEqual(expect.arrayContaining(["AGENTS.md", "OPENCODE.md"]));
        });

        it("does not duplicate instructions on re-init", () => {
            runAdapterPostInit(ADAPTERS.opencode, tempDir);
            runAdapterPostInit(ADAPTERS.opencode, tempDir);
            const cfg = JSON.parse(fs.readFileSync(path.join(tempDir, "opencode.json"), "utf8"));
            expect(cfg.instructions.filter((i: string) => i === "AGENTS.md")).toHaveLength(1);
        });
    });
});
