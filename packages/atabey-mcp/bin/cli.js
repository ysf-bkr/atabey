#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Friendly Error Messages ──────────────────────────────────────
const ERRORS = {
    BUILD_REQUIRED: `
╔══════════════════════════════════════════════════════════╗
║  🚧  Atabey MCP is not built yet                         ║
╠══════════════════════════════════════════════════════════╣
║  The compiled MCP server was not found at:               ║
║    dist/mcp/index.js                                     ║
║                                                          ║
║  📋  To fix this, run:                                   ║
║     npm run build                                        ║
║                                                          ║
║  💡  This compiles TypeScript source into JavaScript.    ║
║     After build completes, run atabey-mcp again.          ║
╚══════════════════════════════════════════════════════════╝
`,
    NODE_VERSION: `
╔══════════════════════════════════════════════════════════╗
║  ⚠️  Unsupported Node.js version                       ║
╠══════════════════════════════════════════════════════════╣
║  Atabey requires Node.js >= 22.0.0                      ║
║                                                         ║
║  Current version: {version}                             ║
║                                                         ║
║  📋  To fix this:                                       ║
║     • Install Node.js 22+ via:                          ║
║       nvm install 22  (if using nvm)                    ║
║       brew install node  (if using Homebrew)            ║
║       https://nodejs.org  (official installer)          ║
║                                                         ║
║     • Then switch to it:                                ║
║       nvm use 22    (if using nvm)                      ║
╚══════════════════════════════════════════════════════════╝
`,
    SPAWN_FAILED: `
╔══════════════════════════════════════════════════════════╗
║  ❌  Failed to start Atabey MCP Server                  ║
╠══════════════════════════════════════════════════════════╣
║  Could not launch the server process.                   ║
║                                                         ║
║  📋  Common causes:                                     ║
║     • Out of memory                                     ║
║     • System resource limits                            ║
║     • Permission issues                                 ║
║                                                         ║
║  Try running again, or check logs for details.          ║
╚══════════════════════════════════════════════════════════╝
`,
};

// ─── Node.js Version Check ────────────────────────────────────────
const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
if (nodeMajor < 22) {
    process.stderr.write(ERRORS.NODE_VERSION.replace("{version}", process.versions.node));
    process.exit(1);
}

// ─── Start MCP Server ─────────────────────────────────────────────
const candidates = [
    join(__dirname, "../dist/atabey-mcp/src/mcp/index.js"),
    join(__dirname, "../dist/mcp/index.js"),
];

let serverPath = "";
for (const cand of candidates) {
    if (fs.existsSync(cand)) {
        serverPath = cand;
        break;
    }
}

if (!serverPath) {
    process.stderr.write(ERRORS.BUILD_REQUIRED);
    process.exit(1);
}

const MAX_RESTARTS = 5;
const STABLE_RUN_THRESHOLD_MS = 30000;
let restartCount = 0;
let isShuttingDown = false;
let currentChild = null;

function stopChild(signal) {
    isShuttingDown = true;
    if (currentChild && !currentChild.killed) {
        try { currentChild.kill(signal); } catch { /* already gone */ }
        // Do not hang forever if the child ignores the signal.
        setTimeout(() => process.exit(0), 2000).unref();
    } else {
        process.exit(0);
    }
}

process.on("SIGINT", () => stopChild("SIGINT"));
process.on("SIGTERM", () => stopChild("SIGTERM"));

function spawnServer() {
    const startTime = Date.now();
    const cmd = "node";
    const child = spawn(cmd, [serverPath, ...process.argv.slice(2)], {
        stdio: "inherit",
        shell: false
    });
    currentChild = child;

    child.on("error", (err) => {
        process.stderr.write(ERRORS.SPAWN_FAILED);
        process.stderr.write(`\n[DETAIL] ${err.message}\n\n`);
        if (!isShuttingDown && restartCount < MAX_RESTARTS) {
            restartCount++;
            process.stderr.write(`[atabey-mcp] Retrying startup in 1s (${restartCount}/${MAX_RESTARTS})...\n`);
            setTimeout(spawnServer, 1000);
        } else {
            process.exit(1);
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
            process.stderr.write(`\n[atabey-mcp] ⚠️ Server crashed (exit code: ${code}, signal: ${signal || "none"}).\n`);
            process.stderr.write(`[atabey-mcp] 🔄 Auto-restarting server (attempt ${restartCount}/${MAX_RESTARTS}) in 1s...\n\n`);
            setTimeout(spawnServer, 1000);
        } else {
            if (restartCount > MAX_RESTARTS) {
                process.stderr.write(`\n[atabey-mcp] ❌ Maximum restart attempts (${MAX_RESTARTS}) reached. Aborting.\n`);
            }
            process.exit(code ?? 1);
        }
    });
}

spawnServer();
