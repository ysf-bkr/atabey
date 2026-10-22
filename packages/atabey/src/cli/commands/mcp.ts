import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { MCP } from "../../shared/constants.js";
import { logger } from "../../shared/logger.js";
import { buildMcpServerEntry, writeRootMcpConfig } from "../platforms/core.js";
import { getPackageRoot } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

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
    UI.intent("[MCP]", "Starting Atabey MCP Server...");

    const packageRoot = getPackageRoot();
    const projectRoot = process.cwd();

    // Built MCP entry — resolved relative to the installed/local atabey package.
    let mcpPath = path.join(packageRoot, MCP.SERVER_DIST_PATH);
    let runner = "node";

    if (!fs.existsSync(mcpPath)) {
        const localInstall = path.join(projectRoot, "node_modules/atabey", MCP.SERVER_DIST_PATH);
        if (fs.existsSync(localInstall)) {
            mcpPath = localInstall;
        } else {
            // Dev fallback: TypeScript source in the framework monorepo.
            const devPath = path.join(packageRoot, "../atabey-mcp/src/mcp/index.ts");
            if (fs.existsSync(devPath)) {
                mcpPath = devPath;
                runner = "npx";
            } else {
                runner = "npx";
                mcpPath = "atabey-mcp";
            }
        }
    }

    const args = runner === "npx"
        ? (mcpPath === "atabey-mcp" ? ["-y", "atabey-mcp"] : ["tsx", mcpPath])
        : [mcpPath];

    UI.success("MCP Server starting via " + runner + "...");
    logger.info("[MCP] Starting MCP server", { runner, path: mcpPath });

    const MAX_RESTARTS = 5;
    const STABLE_RUN_THRESHOLD_MS = 30000;
    let restartCount = 0;
    let isShuttingDown = false;

    process.on("SIGINT", () => { isShuttingDown = true; process.exit(0); });
    process.on("SIGTERM", () => { isShuttingDown = true; process.exit(0); });

    function launchInstance() {
        const startTime = Date.now();
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
            if (!isShuttingDown && restartCount < MAX_RESTARTS) {
                restartCount++;
                UI.warning(`[MCP] Retrying startup in 1s (${restartCount}/${MAX_RESTARTS})...`);
                setTimeout(launchInstance, 1000);
            } else {
                process.exit(70);
            }
        });

        child.on("exit", (code, signal) => {
            if (isShuttingDown || code === 0 || signal === "SIGINT" || signal === "SIGTERM") {
                process.exit(0);
            }

            const uptime = Date.now() - startTime;
            if (uptime > STABLE_RUN_THRESHOLD_MS) {
                restartCount = 0;
            }

            restartCount++;
            const canRestart = process.env.ATABEY_AUTO_RESTART !== "false" && restartCount <= MAX_RESTARTS;

            if (canRestart) {
                UI.warning(`[MCP] Server crashed (exit code: ${code}). Auto-restarting in 1s (${restartCount}/${MAX_RESTARTS})...`);
                logger.warn("[MCP] Auto-restarting crashed MCP server", { code, restartCount });
                setTimeout(launchInstance, 1000);
            } else {
                if (restartCount > MAX_RESTARTS) {
                    UI.error(`[MCP] Maximum restart attempts (${MAX_RESTARTS}) reached. Aborting.`);
                } else {
                    UI.error(`MCP Server exited with code ${code}`);
                }
                process.exit(code || 70);
            }
        });
    }

    launchInstance();
}

async function installMcpConfig() {
    process.stdout.write("[MCP] Installing Atabey MCP configuration...\n");

    const projectRoot = process.cwd();
    writeRootMcpConfig(projectRoot, "claude");

    const configPath = path.resolve(projectRoot, MCP.ROOT_CONFIG_FILE);
    const entry = buildMcpServerEntry(projectRoot);
    process.stdout.write(`[OK] Created ${MCP.ROOT_CONFIG_FILE} at ${configPath}\n`);
    process.stdout.write(`[INFO] Transport: ${entry.env[MCP.TRANSPORT_ENV]} (IDE-compatible stdio)\n`);
    process.stdout.write("[INFO] Used by Claude Code, Cursor, Codex/Copilot, and Grok.\n");
    process.stdout.write("[INFO] For HTTP/SSE unified mode: MCP_TRANSPORT=unified MCP_PORT=5858\n");
}

async function checkMcpStatus() {
    process.stdout.write("[MCP] Checking MCP Server Status...\n");
    const distPath = path.join(getPackageRoot(), MCP.SERVER_DIST_PATH);
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
  start     Start the MCP server (Stdio transport) — connects to Claude/Cursor/Codex
  install   Generate the root .mcp.json configuration for AI interfaces
  status    Check the health and build status of the MCP server
  help      Show this help message

About MCP Integration:
  Atabey connects to AI interfaces via the Model Context Protocol (MCP).
  Supported platforms and their native config:
    - Claude Code    (reads .mcp.json)
    - Cursor         (reads .cursor/mcp.json)
    - Codex CLI      (reads .mcp.json)
    - Grok           (reads .grok/mcp_config.json)
    - Antigravity CLI(reads .agents/mcp_config.json)
    - OpenCode       (reads opencode.json)
    - Local LLM      (reads .atabey/mcp_config.json)

  Once connected, you can use @agent syntax in your AI chat:
    @backend Create a user login service
    @security Audit the auth module
    @quality Run compliance check
\n`);
}
