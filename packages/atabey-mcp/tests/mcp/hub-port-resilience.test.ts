import { spawn } from "child_process";
import net from "net";
import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * A stdio MCP server must survive a busy HTTP port.
 *
 * Regression: in stdio mode the server also starts a coordination hub on
 * MCP_PORT. When that port was taken (a second AI client, or a hub left over
 * from another project), the bind error surfaced as an uncaught EADDRINUSE and
 * the process exited 1 — the client showed the server as "failed" and no tools
 * were available. Found by running `opencode mcp list` against a generated
 * config.
 */

const DIST = path.resolve(__dirname, "../../dist/atabey-mcp/src/mcp/index.js");
const describeIf = fs.existsSync(DIST) ? describe : describe.skip;

/**
 * The hub is skipped when NODE_ENV=test or VITEST is set, so the child must not
 * inherit either — otherwise this test would pass without touching the code
 * path it is meant to guard.
 */
function childEnv(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (v === undefined) continue;
        if (k === "VITEST" || k === "NODE_ENV" || k.startsWith("VITEST_")) continue;
        env[k] = v;
    }
    return env;
}

/** Occupies `count` consecutive ports from `start` and returns a closer. */
function occupyPorts(start: number, count: number): Promise<{ close: () => Promise<void> }> {
    const servers: net.Server[] = [];
    return new Promise((resolve, reject) => {
        let remaining = count;
        for (let i = 0; i < count; i++) {
            const srv = net.createServer((socket) => {
                // Accept and immediately drop probing connections.
                socket.destroy();
            });
            srv.once("error", reject);
            srv.listen(start + i, "127.0.0.1", () => {
                servers.push(srv);
                if (--remaining === 0) {
                    resolve({
                        close: () =>
                            Promise.all(
                                servers.map(
                                    (srv) =>
                                        new Promise<void>((r) => {
                                            // The child probes these ports, so a socket may still
                                            // be open; close() alone would wait for it forever.
                                            (srv as net.Server & { closeAllConnections?: () => void })
                                                .closeAllConnections?.();
                                            srv.close(() => r());
                                        }),
                                ),
                            ).then(() => undefined),
                    });
                }
            });
        }
    });
}

describeIf("stdio server resilience (compiled dist)", () => {
    let projectRoot: string;

    beforeAll(() => {
        projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-stdio-busy-"));
    });

    afterAll(() => {
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it("answers MCP initialize even when every candidate hub port is taken", async () => {
        // Pick a port range nothing else uses, then occupy all 20 fallback slots.
        const base = 47000 + (process.pid % 500);
        const blocker = await occupyPorts(base, 20);

        try {
            const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
                const child = spawn("node", [DIST], {
                    stdio: ["pipe", "pipe", "pipe"],
                    env: {
                        ...childEnv(),
                        MCP_TRANSPORT: "stdio",
                        MCP_PORT: String(base),
                        MCP_HOST: "127.0.0.1",
                        ATABEY_PROJECT_ROOT: projectRoot,
                        ATABEY_AUTO_START_ORCHESTRATOR: "false",
                        ATABEY_PORT_STRICT: "false",
                        ...childEnv(),
                    },
                });

                let stdout = "";
                let stderr = "";
                child.stdout.on("data", (d) => { stdout += d.toString(); });
                child.stderr.on("data", (d) => { stderr += d.toString(); });

                child.stdin.write(
                    JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: "initialize",
                        params: {
                            protocolVersion: "2024-11-05",
                            capabilities: {},
                            clientInfo: { name: "busy-port-test", version: "1.0" },
                        },
                    }) + "\n",
                );

                const timer = setTimeout(() => {
                    child.kill();
                    resolve({ stdout, stderr, code: null });
                }, 25_000);

                child.on("exit", (code) => {
                    clearTimeout(timer);
                    resolve({ stdout, stderr, code });
                });

                // Wait for initialize, then give the async hub bind a moment so
                // the fallback/degradation lines are actually captured.
                let responding = false;
                const poll = setInterval(() => {
                    if (!responding && stdout.includes("serverInfo")) responding = true;
                    if (responding && /continuing with stdio only|falling back to port|Unified server ready on port/i.test(stderr)) {
                        clearInterval(poll);
                        clearTimeout(timer);
                        child.kill();
                        resolve({ stdout, stderr, code: null });
                    }
                }, 100);
            });

            // 1) The process must not die with an uncaught bind error.
            expect(result.stderr).not.toContain("FATAL uncaught exception");
            expect(result.code === null || result.code === 0 || result.code === 143).toBe(true);

            // 2) It must actually serve MCP over stdio.
            const init = result.stdout.split("\n").find((l) => l.includes("serverInfo"));
            expect(init, `no initialize response. stderr:\n${result.stderr}`).toBeTruthy();
            expect(init!).toContain("atabey-mcp");

            // 3) The degradation must be announced, not silent.
            expect(result.stderr).toMatch(/continuing with stdio only|falling back to port/i);

            // 4) Stdout stays pure JSON-RPC (diagnostics go to stderr).
            for (const line of result.stdout.split("\n").filter(Boolean)) {
                expect(() => JSON.parse(line)).not.toThrow();
            }
        } finally {
            await blocker.close();
        }
    }, 60_000);

    it("still binds a hub when a port is available", async () => {
        const base = 48000 + (process.pid % 500);
        const result = await new Promise<{ stderr: string }>((resolve) => {
            const child = spawn("node", [DIST], {
                stdio: ["pipe", "pipe", "pipe"],
                env: {
                    ...childEnv(),
                    MCP_TRANSPORT: "stdio",
                    MCP_PORT: String(base),
                    MCP_HOST: "127.0.0.1",
                    ATABEY_PROJECT_ROOT: projectRoot,
                    ATABEY_AUTO_START_ORCHESTRATOR: "false",
                    ...childEnv(),
                },
            });
            let stderr = "";
            child.stderr.on("data", (d) => { stderr += d.toString(); });
            child.stdin.write(JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "initialize",
                params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "t", version: "1" } },
            }) + "\n");

            const timer = setTimeout(() => { child.kill(); resolve({ stderr }); }, 20_000);
            let sawInit = false;
            const poll = setInterval(() => {
                if (!sawInit && stderr !== "" && seenStdout) sawInit = true;
                if (sawInit && /Unified server ready on port|Hub unavailable/i.test(stderr)) {
                    clearInterval(poll);
                    clearTimeout(timer);
                    child.kill();
                    resolve({ stderr });
                }
            }, 100);
            let seenStdout = false;
            child.stdout.on("data", (d) => {
                if (d.toString().includes("serverInfo")) seenStdout = true;
            });
        });

        expect(result.stderr).toContain("Unified server ready on port");
        expect(result.stderr).not.toContain("Hub unavailable");
    }, 45_000);
});
