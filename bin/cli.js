#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cliPath = join(__dirname, "../dist/src/cli/index.js");

if (!fs.existsSync(cliPath)) {
    process.stderr.write("\n[ERROR] Error: Compiled CLI not found at 'dist/src/cli/index.js'\n");
    process.stderr.write("[TIP] Solution Tip: Run 'npm run build' to compile the project first.\n\n");
    process.exit(1);
}

const cmd = "node";
const child = spawn(cmd, [cliPath, ...process.argv.slice(2)], {
    stdio: "inherit",
    shell: false 
});

child.on("exit", (code) => {
    process.exit(code ?? 0);
});
