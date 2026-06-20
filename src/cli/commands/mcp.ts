import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../../shared/logger.js";
import { UI } from "../utils/ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Command to manage the MCP server.
 *
 * Atabey connects to AI interfaces (Claude Code, Gemini CLI, Cursor, Codex)
 * via the MCP (Model Context Protocol) standard.
 *
 * The MCP server runs as a stdio transport:
 * - stdin/stdout: JSON-RPC protocol messages (reserved for MCP)
 * - stderr: Server logs and diagnostics
 */
export async function mcpCommand(args: string[]) {
    const subcommand = args[0] || "help";

    switch (subcommand) {
        case "start":
            await startMcpServer();
            break;
        case "install":
            await installMcpConfig();
            break;
        case "status":
            await checkMcpStatus();
            break;
        case "help":
        default:
            showMcpHelp();
            break;
    }
}

async function startMcpServer() {
    UI.intent("[MCP]", "Starting Agent Atabey MCP Server...");

    // Find the framework-mcp entry point
    let mcpPath = path.resolve(__dirname, "../../../framework-mcp/dist/index.js");
    let runner = "node";

    if (!fs.existsSync(mcpPath)) {
        mcpPath = path.resolve(__dirname, "../../../framework-mcp/src/index.ts");
        runner = "npx";
        if (!fs.existsSync(mcpPath)) {
            UI.error(`MCP Server entry point not found at ${mcpPath}`);
            UI.info("Try running 'npm run build' first.");
            process.exit(70);
        }
    }

    const args = runner === "npx" ? ["tsx", mcpPath] : [mcpPath];

    UI.success("MCP Server starting via " + runner + "...");
    logger.info("[MCP] Starting MCP server", { runner, path: mcpPath });

    // MCP uses stdio transport:
    // - stdin/stdout: JSON-RPC protocol (clean pipe to AI interface)
    // - stderr: server diagnostics and logs
    const child = spawn(runner, args, {
        stdio: ["inherit", "inherit", "inherit"],
        env: {
            ...process.env,
            ATABEY_PROJECT_ROOT: process.cwd(),
            MCP_TRANSPORT: "stdio"
        }
    });

    child.on("error", (err) => {
        UI.error(`Failed to start MCP Server: ${err.message}`);
        logger.error("[MCP] Failed to start server", err);
        process.exit(70);
    });

    child.on("exit", (code) => {
        if (code !== 0) {
            UI.error(`MCP Server exited with code ${code}`);
            process.exit(code || 70);
        }
    });
}

async function installMcpConfig() {
    process.stdout.write("[MCP] Installing Agent Atabey MCP configuration...\n");

    // Generate mcp.json configuration for AI interfaces
    const configPath = path.resolve(process.cwd(), "mcp.json");
    const mcpConfig = {
        mcpServers: {
            atabey: {
                command: "atabey",
                args: ["mcp", "start"],
                env: {
                    MCP_TRANSPORT: "stdio",
                    ATABEY_PROJECT_ROOT: process.cwd()
                }
            }
        }
    };

    fs.writeFileSync(configPath, JSON.stringify(mcpConfig, null, 2));
    process.stdout.write(`[OK] Created mcp.json at ${configPath}\n`);
    process.stdout.write("[INFO] This config is used by Claude Code, Gemini CLI, and Cursor to connect to Atabey.\n");
    process.stdout.write("[INFO] Point your AI interface's MCP config to this file.\n");
}

async function checkMcpStatus() {
    process.stdout.write("[MCP] Checking MCP Server Status...\n");
    const distPath = path.resolve(__dirname, "../../../framework-mcp/dist/index.js");
    if (fs.existsSync(distPath)) {
        process.stdout.write("[OK] MCP Server is built and ready to start.\n");
    } else {
        process.stdout.write("[WARN] MCP Server is NOT built. Run 'npm run build' to prepare it.\n");
    }
}

function showMcpHelp() {
    process.stdout.write(`
Usage: atabey mcp <subcommand>

Subcommands:
  start     Start the MCP server (Stdio transport) — connects to Claude/Gemini/Cursor
  install   Generate a local mcp.json configuration for AI interfaces
  status    Check the health and build status of the MCP server
  help      Show this help message

About MCP Integration:
  Atabey connects to AI interfaces via the Model Context Protocol (MCP).
  Supported platforms:
    - Claude Code    (reads mcp.json)
    - Gemini CLI     (reads mcp.json)
    - Cursor         (reads .cursor/mcp.json)
    - Codex CLI      (reads mcp.json)
    - Antigravity CLI

  Once connected, you can use @agent syntax in your AI chat:
    @backend Create a user login service
    @security Audit the auth module
    @quality Run compliance check
\n`);
}
