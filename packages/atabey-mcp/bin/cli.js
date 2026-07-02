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
║  Atabey requires Node.js >= 18.0.0                      ║
║                                                         ║
║  Current version: {version}                             ║
║                                                         ║
║  📋  To fix this:                                       ║
║     • Install Node.js 18+ via:                          ║
║       nvm install 18  (if using nvm)                    ║
║       brew install node  (if using Homebrew)            ║
║       https://nodejs.org  (official installer)          ║
║                                                         ║
║     • Then switch to it:                                ║
║       nvm use 18    (if using nvm)                      ║
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
if (nodeMajor < 18) {
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

const cmd = "node";
const child = spawn(cmd, [serverPath, ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: false
});

child.on("error", (err) => {
    process.stderr.write(ERRORS.SPAWN_FAILED);
    process.stderr.write(`\n[DETAIL] ${err.message}\n\n`);
    process.exit(1);
});

child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
        // Non-zero exit — the server already printed the error
        process.exit(code);
    }
    process.exit(code ?? 0);
});
