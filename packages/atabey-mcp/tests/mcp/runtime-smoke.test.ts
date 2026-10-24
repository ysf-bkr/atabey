import { describe, it, expect } from "vitest";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";

/**
 * P0 Runtime Smoke Test — guards against the class of bug where unit tests pass
 * (they resolve sources via tsconfig `paths` / vitest alias) but the PUBLISHED
 * artifact crashes at runtime because `package.json` `exports` does not expose a
 * subpath (e.g. `atabey/src/cli/utils/time.js` -> ERR_PACKAGE_PATH_NOT_EXPORTED).
 *
 * This test spawns the COMPILED MCP server from `dist/` and speaks real
 * JSON-RPC over stdio, exercising the actual Node ESM `exports` resolution.
 * It requires a build first (`npm run build`); if `dist` is absent it skips so
 * that a plain `npm test` (no build) still succeeds — CI runs build before test.
 */

const MCP_DIST = path.resolve(__dirname, "../../dist/atabey-mcp/src/mcp/index.js");

function rpc(messages: object[]): Promise<string[]> {
    return new Promise((resolve, reject) => {
        const child = spawn("node", [MCP_DIST], {
            stdio: ["pipe", "pipe", "pipe"],
            env: {
                ...process.env,
                MCP_TRANSPORT: "stdio",
                // Point the server at an isolated temp project so it never
                // touches the real workspace .atabey/ state.
                ATABEY_PROJECT_ROOT: fs.mkdtempSync(path.join(os.tmpdir(), "atabey-smoke-")),
                ATABEY_AUTO_START_ORCHESTRATOR: "false",
                NODE_ENV: "test",
            },
        });

        const responses: string[] = [];
        const rl = readline.createInterface({ input: child.stdout });
        rl.on("line", (line) => {
            const trimmed = line.trim();
            if (trimmed.startsWith("{")) responses.push(trimmed);
        });

        let stderr = "";
        child.stderr.on("data", (d) => { stderr += d.toString(); });

        // Resolve as soon as we have BOTH responses; don't wait for the process
        // to exit (the MCP server stays alive in stdio mode).
        const done = (fail = false) => {
            clearTimeout(collectTimer);
            clearTimeout(hardTimer);
            rl.close();
            try { child.kill(); } catch { /* ignore */ }
            if (fail) return;
            resolve(responses);
        };

        const expectedResponses = messages.filter(m => "id" in (m as Record<string, unknown>)).length;
        const collectTimer = setInterval(() => {
            if (responses.length >= expectedResponses) done();
        }, 50);

        const hardTimer = setTimeout(() => {
            if (stderr.includes("ERR_") || stderr.includes("Error")) {
                reject(new Error(`MCP crashed at startup: ${stderr.split("\n").slice(0, 6).join("\n")}`));
            } else {
                done();
            }
        }, 20000);

        child.on("error", (err) => { clearTimeout(collectTimer); clearTimeout(hardTimer); reject(err); });
        child.on("exit", (code) => {
            // If it exited on its own before we collected everything, that is a crash.
            if (responses.length < messages.length && code !== 0 && code !== null) {
                clearTimeout(collectTimer);
                clearTimeout(hardTimer);
                rl.close();
                reject(new Error(`MCP exited (code ${code}) before responding. stderr: ${stderr.split("\n").slice(0, 6).join("\n")}`));
            }
        });

        for (const msg of messages) child.stdin.write(JSON.stringify(msg) + "\n");
    });
}

describeIf(fs.existsSync(MCP_DIST))("MCP runtime smoke (compiled dist over stdio)", () => {
    it("initializes and advertises its tools without crashing", async () => {
        const responses = await rpc([
            { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke", version: "1.0" } } },
            { jsonrpc: "2.0", method: "notifications/initialized" },
            { jsonrpc: "2.0", id: 2, method: "tools/list" },
        ]);
        // 1) initialize must return a serverInfo (proves exports resolution works)
        const init = responses.find(r => r.includes("serverInfo"));
        expect(init, `no initialize response. stderr may show a crash`).toBeTruthy();
        expect(init!).toContain("atabey-mcp");

        // 2) tools/list must return the full tool set
        const list = responses.find(r => r.includes("\"tools\"") || r.includes("\"name\""));
        expect(list, "no tools/list response").toBeTruthy();

        const toolNames = [...responses.join(" ").matchAll(/"name":"([a-z_]+)"/g)].map(m => m[1]);
        const unique = Array.from(new Set(toolNames));
        expect(unique.length, `expected 40 tools, got ${unique.length}: ${unique.join(", ")}`).toBe(40);
        expect(unique).toContain("read_file");
        expect(unique).toContain("write_file");
        expect(unique).toContain("run_shell_command");
    }, 30000);
});

/** Runs the suite only when `dist` exists; otherwise reports as skipped. */
function describeIf(condition: boolean) {
    return condition ? describe : describe.skip;
}
