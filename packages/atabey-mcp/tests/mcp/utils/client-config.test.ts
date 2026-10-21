import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClientConfigGenerator } from "../../../src/mcp/utils/client-config.js";

describe("ClientConfigGenerator — Target AI Tooling & OpenCode", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-client-test-"));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should generate 100% compliant opencode.json for OpenCode", () => {
        const config = ClientConfigGenerator.forOpenCode(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("opencode");
        expect(config.configPath).toBe(path.join(tempDir, "opencode.json"));

        const content = config.configContent as {
            $schema?: string;
            mcp?: Record<string, { type: string; url?: string; command?: string[]; enabled: boolean }>;
            instructions?: string[];
        };

        expect(content.$schema).toBe("https://opencode.ai/config.json");
        expect(content.mcp).toBeDefined();
        expect(content.mcp?.["atabey"]?.type).toBe("local");
        expect(Array.isArray(content.mcp?.["atabey"]?.command)).toBe(true);
        expect(content.mcp?.["atabey"]?.enabled).toBe(true);
        expect(content.mcp?.["atabey-local"]).toBeUndefined();


        expect(content.instructions).toContain("AGENTS.md");
    });

    it("should generate Claude Code mcp.json", () => {
        const config = ClientConfigGenerator.forClaudeCode(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("claude");
        expect(config.configPath).toBe(path.join(tempDir, "mcp.json"));

        const content = config.configContent as {
            mcpServers?: Record<string, { type: string; url?: string }>;
        };
        expect(content.mcpServers?.["atabey"]?.type).toBe("sse");
        expect(content.mcpServers?.["atabey"]?.url).toBe("http://localhost:5858/mcp/sse");
    });

    it("should generate Cursor .cursor/mcp.json", () => {
        const config = ClientConfigGenerator.forCursor(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("cursor");
        expect(config.configPath).toBe(path.join(tempDir, ".cursor", "mcp.json"));

        const content = config.configContent as {
            mcpServers?: Record<string, { type: string; url?: string }>;
        };
        expect(content.mcpServers?.["atabey"]?.type).toBe("sse");
    });

    it("should generate Codex / Copilot .vscode/mcp.json", () => {
        const config = ClientConfigGenerator.forCodex(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("codex");
        expect(config.configPath).toBe(path.join(tempDir, ".vscode", "mcp.json"));
    });

    it("should generate Antigravity .agents/mcp_config.json", () => {
        const config = ClientConfigGenerator.forAntigravity(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("antigravity");
        expect(config.configPath).toBe(path.join(tempDir, ".agents", "mcp_config.json"));
    });

    it("should generate Grok .grok/mcp_config.json", () => {
        const config = ClientConfigGenerator.forGrok(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("grok");
        expect(config.configPath).toBe(path.join(tempDir, ".grok", "mcp_config.json"));
    });

    it("should generate Local LLM .atabey/mcp_config.json", () => {
        const config = ClientConfigGenerator.forLocal(tempDir, "developer1", "token-xyz", "localhost", 5858);
        expect(config.clientType).toBe("local");
        expect(config.configPath).toBe(path.join(tempDir, ".atabey", "mcp_config.json"));
    });

    it("should generate all supported configurations and setup guide", () => {
        const all = ClientConfigGenerator.generateAll(tempDir, "alice", "alice-tok", "127.0.0.1", 5858);
        const types = all.map(c => c.clientType);

        expect(types).toContain("claude");
        expect(types).toContain("cursor");
        expect(types).toContain("opencode");
        expect(types).toContain("codex");
        expect(types).toContain("antigravity");
        expect(types).toContain("grok");
        expect(types).toContain("local");

        const guide = ClientConfigGenerator.generateSetupGuide(tempDir, "alice", "alice-tok", "127.0.0.1", 5858);
        expect(guide).toContain("Atabey MCP Setup Guide — alice");
        expect(guide).toContain("OPENCODE");
        expect(guide).toContain("CURSOR");
        expect(guide).toContain("CLAUDE");
    });
});
