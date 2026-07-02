import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MCP } from "../../shared/constants.js";
import { logger } from "../../shared/logger.js";
import { buildMcpServerEntry, writeRootMcpConfig } from "../platforms/core.js";
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

    // Find the atabey-mcp entry point (legacy "framework-mcp" paths kept for compatibility in tests)
    let mcpPath = path.resolve(__dirname, "../../../atabey-mcp/dist/atabey-mcp/src/mcp/index.js");
    let runner = "node";

    if (!fs.existsSync(mcpPath)) {
        mcpPath = path.join(process.cwd(), "node_modules/atabey-mcp/dist/atabey-mcp/src/mcp/index.js");
        if (!fs.existsSync(mcpPath)) {
            mcpPath = path.resolve(__dirname, "../../../atabey-mcp/src/mcp/index.ts");
            runner = "npx";
            if (!fs.existsSync(mcpPath)) {
                UI.error(`MCP Server entry point not found at ${mcpPath}`);
                UI.info("Try running 'npm run build' first.");
                process.exit(70);
            }
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
            [MCP.TRANSPORT_ENV]: MCP.TRANSPORT_STDIO,
            ATABEY_AUTO_START_ORCHESTRATOR: "true",
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

    const projectRoot = process.cwd();
    writeRootMcpConfig(projectRoot);

    const configPath = path.resolve(projectRoot, MCP.ROOT_CONFIG_FILE);
    const entry = buildMcpServerEntry(projectRoot);
    process.stdout.write(`[OK] Created ${MCP.ROOT_CONFIG_FILE} at ${configPath}\n`);
    process.stdout.write(`[INFO] Transport: ${entry.env[MCP.TRANSPORT_ENV]} (IDE-compatible stdio)\n`);
    process.stdout.write("[INFO] Used by Claude Code, Gemini CLI, Cursor, Codex, and Grok.\n");
    process.stdout.write("[INFO] For HTTP/SSE unified mode: MCP_TRANSPORT=unified MCP_PORT=5858\n");
}

async function checkMcpStatus() {
    process.stdout.write("[MCP] Checking MCP Server Status...\n");
    const distPath = path.resolve(__dirname, "../../../atabey-mcp/dist/mcp/index.js");
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
