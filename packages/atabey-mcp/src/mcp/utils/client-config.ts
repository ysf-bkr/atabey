/**
 * [MCP] Client Config Generator — Multi-Developer MCP Setup
 *
 * Generates MCP client configuration files for each developer.
 * Each developer gets their own auth token and connects to the shared MCP server.
 *
 * Supported clients:
 * - Claude Code (.claude/settings.json or mcp.json)
 * - Cursor (.cursor/mcp.json)
 * - VS Code (via settings.json)
 * - Gemini CLI
 *
 * Usage:
 *   ATABEY_PROJECT_ROOT=/project
 *   MCP_AUTH_USERS=alice:key1,bob:key2
 *   MCP_HOST=0.0.0.0
 *   MCP_PORT=5858
 *
 * Each developer runs: atabey mcp setup --user alice
 * This creates the client config file pointing to the shared server.
 */

import fs from "fs";
import path from "path";

export type MCPClientType = "claude" | "cursor" | "vscode" | "gemini";

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
     * Generate client configuration for all supported IDEs.
     */
    public static generateAll(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig[] {
        return [
            ClientConfigGenerator.forClaudeCode(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forCursor(projectRoot, userName, userToken, host, port),
            ClientConfigGenerator.forVSCode(projectRoot, userName, userToken, host, port),
        ];
    }

    /**
     * Generate Claude Code config.
     * Creates/updates mcp.json in the project root.
     */
    public static forClaudeCode(projectRoot: string, userName: string, userToken: string, host: string, port: number): MCPClientConfig {
        const configPath = path.join(projectRoot, "mcp.json");
        const mcpServerUrl = `http://${host}:${port}/mcp`;

        let existingConfig: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
            try {
                existingConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
            } catch {
                // Corrupted file, start fresh
            }
        }

        // Ensure mcpServers key exists
        const mcpServers = (existingConfig.mcpServers as Record<string, unknown>) || {};

        // Add or update the atabey entry
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
            instructions: `Add the following to your Claude Code mcp.json at ${configPath}:
${JSON.stringify({ mcpServers: { atabey: mcpServers["atabey"] } }, null, 2)}`,
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

        const mcpServerUrl = `http://${host}:${port}/mcp`;

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
            instructions: `Add the following to your Cursor config at ${configPath}:
${JSON.stringify(config, null, 2)}`,
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
            } catch {
                // Corrupted file, start fresh
            }
        }

        const mcpServerUrl = `http://${host}:${port}/mcp`;

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
            instructions: `Add the following to your VS Code settings at ${configPath}:
${JSON.stringify({ "mcp.servers": mcpConfig }, null, 2)}`,
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
        guide += `- URL: http://${host}:${port}/mcp\n`;
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
