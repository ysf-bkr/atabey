/**
 * [MCP] Client Config Generator — Multi-Developer MCP Setup
 *
 * Generates MCP client configuration files for each developer.
 * Each developer gets their own auth token and connects to the shared MCP server.
 *
 * Supported clients:
 * - Claude Code (mcp.json)
 * - Cursor (.cursor/mcp.json)
 * - OpenCode (opencode.json) — 100% compliant schema
 * - Codex / Copilot (.vscode/mcp.json, .github/copilot-instructions.md)
 * - Antigravity (.gemini/antigravity-cli/mcp.json / .agents/mcp_config.json)
 * - Grok (.grok/mcp_config.json)
 * - Local LLM (.atabey/mcp_config.json)
 * - VS Code (.vscode/settings.json)
 */

import fs from "fs";
import path from "path";
import { logger } from "../../../shared/logger.js";

export type MCPClientType = "claude" | "cursor" | "opencode" | "codex" | "antigravity" | "grok" | "local" | "vscode";

export interface MCPClientConfig {
    clientType: MCPClientType;
    configPath: string;
    configContent: Record<string, unknown>;
    instructions: string;
}

/**
 * Generates MCP client configuration for a specific developer.
 * Each config points to the shared MCP server with the developer's auth token.
 */
export class ClientConfigGenerator {
    /**
     * Generate client configuration for all supported AI agents and IDEs.
     */
    public static generateAll(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig[] {
        return [
            ClientConfigGenerator.forClaudeCode(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forCursor(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forOpenCode(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forCodex(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forAntigravity(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forGrok(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forLocal(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forVSCode(projectRoot, userName, userToken, host, port),
        ];
    }

    /**
     * Generate Claude Code config.
     * Creates/updates mcp.json in the project root.
     */
    public static forClaudeCode(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const configPath = path.join(projectRoot, "mcp.json");
        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        let existingConfig: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
            try {
                existingConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
            } catch (err) {
                logger.debug("Client config operation failed (non-fatal)", err);
            }
        }

        const mcpServers = (existingConfig.mcpServers as Record<string, unknown>) || {};

        mcpServers["atabey"] = {
            type: "sse",
            url: mcpServerUrl,
            headers: {
                Authorization: `Bearer ${userToken}`,
                "X-User": userName,
            },
        };

        mcpServers["atabey-stdio"] = {
            command: "node",
            args: [path.join(projectRoot, "node_modules/atabey-mcp/dist/atabey-mcp/src/mcp/index.js")],
            env: {
                ATABEY_PROJECT_ROOT: projectRoot,
                MCP_USER: userName,
            },
        };

        existingConfig.mcpServers = mcpServers;

        return {
            clientType: "claude",
            configPath,
            configContent: existingConfig,
            instructions: `Add the following to your Claude Code mcp.json at ${configPath}:\n${JSON.stringify({ mcpServers: { atabey: mcpServers["atabey"] } }, null, 2)}`,
        };
    }

    /**
     * Generate Cursor config.
     * Creates/updates .cursor/mcp.json in the project root.
     */
    public static forCursor(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const cursorDir = path.join(projectRoot, ".cursor");
        const configPath = path.join(cursorDir, "mcp.json");

        if (!fs.existsSync(cursorDir)) {
            fs.mkdirSync(cursorDir, { recursive: true });
        }

        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        const config = {
            mcpServers: {
                "atabey": {
                    type: "sse",
                    url: mcpServerUrl,
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "X-User": userName,
                    },
                },
            },
        };

        return {
            clientType: "cursor",
            configPath,
            configContent: config,
            instructions: `Add the following to your Cursor config at ${configPath}:\n${JSON.stringify(config, null, 2)}`,
        };
    }

    /**
     * Generate OpenCode config.
     * Creates/updates opencode.json in the project root with official OpenCode schema.
     */
    public static forOpenCode(projectRoot: string, userName: string, _userToken: string, _host: string, _port: number): MCPClientConfig {
        const configPath = path.join(projectRoot, "opencode.json");

        let existing: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
            try {
                existing = JSON.parse(fs.readFileSync(configPath, "utf8"));
            } catch {
                existing = {};
            }
        }

        existing["$schema"] = "https://opencode.ai/config.json";

        const existingMcp = (existing["mcp"] as Record<string, unknown>) || {};
        existingMcp["atabey"] = {
            type: "local",
            command: [
                "node",
                path.join(projectRoot, "node_modules/atabey-mcp/dist/atabey-mcp/src/mcp/index.js"),
            ],
            environment: {
                ATABEY_PROJECT_ROOT: projectRoot,
                MCP_TRANSPORT: "stdio",
                ATABEY_AUTO_START_ORCHESTRATOR: "true",
                MCP_USER: userName,
            },
            enabled: true,
        };
        delete existingMcp["atabey-local"];

        existing["mcp"] = existingMcp;


        const instructions = Array.isArray(existing["instructions"]) ? existing["instructions"] : [];
        if (!instructions.includes("AGENTS.md")) instructions.push("AGENTS.md");
        if (!instructions.includes("OPENCODE.md")) instructions.push("OPENCODE.md");
        existing["instructions"] = instructions;

        return {
            clientType: "opencode",
            configPath,
            configContent: existing,
            instructions: `OpenCode AI config at ${configPath}:\nRun '/mcps' in OpenCode CLI to verify tools.`,
        };
    }

    /**
     * Generate Codex / Copilot config.
     * Creates/updates .vscode/mcp.json in the project root.
     */
    public static forCodex(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const vscodeDir = path.join(projectRoot, ".vscode");
        const configPath = path.join(vscodeDir, "mcp.json");

        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        const entry = {
            type: "sse",
            url: mcpServerUrl,
            headers: {
                Authorization: `Bearer ${userToken}`,
                "X-User": userName,
            },
        };

        const config = {
            servers: {
                "atabey": entry,
            },
            mcpServers: {
                "atabey": entry,
            },
        };

        return {
            clientType: "codex",
            configPath,
            configContent: config,
            instructions: `Codex / GitHub Copilot MCP configured at ${configPath}.`,
        };
    }

    /**
     * Generate Google Antigravity config.
     * Creates/updates .agents/mcp_config.json.
     */
    public static forAntigravity(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const agentsDir = path.join(projectRoot, ".agents");
        const configPath = path.join(agentsDir, "mcp_config.json");

        if (!fs.existsSync(agentsDir)) {
            fs.mkdirSync(agentsDir, { recursive: true });
        }

        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        const config = {
            mcpServers: {
                "atabey": {
                    type: "sse",
                    url: mcpServerUrl,
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "X-User": userName,
                    },
                },
            },
        };

        return {
            clientType: "antigravity",
            configPath,
            configContent: config,
            instructions: `Google Antigravity MCP config at ${configPath}.`,
        };
    }

    /**
     * Generate Grok (xAI) config.
     * Creates/updates .grok/mcp_config.json.
     */
    public static forGrok(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const grokDir = path.join(projectRoot, ".grok");
        const configPath = path.join(grokDir, "mcp_config.json");

        if (!fs.existsSync(grokDir)) {
            fs.mkdirSync(grokDir, { recursive: true });
        }

        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        const config = {
            mcpServers: {
                "atabey": {
                    type: "sse",
                    url: mcpServerUrl,
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "X-User": userName,
                    },
                },
            },
        };

        return {
            clientType: "grok",
            configPath,
            configContent: config,
            instructions: `xAI Grok MCP config at ${configPath}.`,
        };
    }

    /**
     * Generate Local LLM (Ollama / Local AI) config.
     * Creates/updates .atabey/mcp_config.json.
     */
    public static forLocal(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const atabeyDir = path.join(projectRoot, ".atabey");
        const configPath = path.join(atabeyDir, "mcp_config.json");

        if (!fs.existsSync(atabeyDir)) {
            fs.mkdirSync(atabeyDir, { recursive: true });
        }

        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        const config = {
            mcpServers: {
                "atabey": {
                    type: "sse",
                    url: mcpServerUrl,
                    headers: {
                        Authorization: `Bearer ${userToken}`,
                        "X-User": userName,
                    },
                },
            },
        };

        return {
            clientType: "local",
            configPath,
            configContent: config,
            instructions: `Local LLM (Ollama/Private AI) MCP config at ${configPath}.`,
        };
    }

    /**
     * Generate VS Code config (via settings.json).
     */
    public static forVSCode(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const vscodeDir = path.join(projectRoot, ".vscode");
        const configPath = path.join(vscodeDir, "settings.json");

        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }

        let existingSettings: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
            try {
                existingSettings = JSON.parse(fs.readFileSync(configPath, "utf8"));
            } catch (err) {
                logger.debug("Client config operation failed (non-fatal)", err);
            }
        }

        const mcpServerUrl = `http://${host}:${port}/mcp/sse`;

        const mcpConfig = {
            "atabey-mcp": {
                type: "sse",
                url: mcpServerUrl,
                headers: {
                    Authorization: `Bearer ${userToken}`,
                    "X-User": userName,
                },
            },
        };

        existingSettings["mcp"] = existingSettings["mcp"] || {};
        (existingSettings["mcp"] as Record<string, unknown>)["servers"] = mcpConfig;

        return {
            clientType: "vscode",
            configPath,
            configContent: existingSettings,
            instructions: `Add the following to your VS Code settings at ${configPath}:\n${JSON.stringify({ "mcp.servers": mcpConfig }, null, 2)}`,
        };
    }

    /**
     * Generate a summary of all configurations for a developer.
     */
    public static generateSetupGuide(projectRoot: string, userName: string, userToken: string, host: string, port: number): string {
        const configs = ClientConfigGenerator.generateAll(projectRoot, userName, userToken, host, port);

        let guide = `# Atabey MCP Setup Guide — ${userName}\n\n`;
        guide += `## Your Auth Token\n`;
        guide += `\`\`\`\nBearer ${userToken}\n\`\`\`\n\n`;
        guide += `## Server Connection\n`;
        guide += `- URL: http://${host}:${port}/mcp/sse\n`;
        guide += `- Auth: Bearer token in Authorization header\n\n`;
        guide += `## Client Configurations\n\n`;

        for (const config of configs) {
            guide += `### ${config.clientType.toUpperCase()}\n`;
            guide += `Config file: \`${config.configPath}\`\n\n`;
            guide += `\`\`\`json\n${JSON.stringify(config.configContent, null, 2)}\n\`\`\`\n\n`;
            guide += config.instructions + "\n\n";
        }

        guide += `## Environment Variables\n`;
        guide += `\`\`\`bash\n`;
        guide += `export ATABEY_PROJECT_ROOT="${projectRoot}"\n`;
        guide += `export MCP_AUTH_USERS="${userName}:${userToken}"\n`;
        guide += `export MCP_HOST="${host}"\n`;
        guide += `export MCP_PORT="${port}"\n`;
        guide += `\`\`\`\n`;

        return guide;
    }
}
