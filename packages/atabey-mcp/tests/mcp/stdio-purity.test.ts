import { spawn } from "child_process";
import path from "path";
import { describe, expect, it } from "vitest";

describe("MCP Stdio JSON-RPC Stream Purity", () => {
    it("emits 100% valid newline-delimited JSON-RPC 2.0 on stdout with zero logger pollution", async () => {
        const repoRoot = path.resolve(__dirname, "../../../..");
        const serverEntry = path.join(repoRoot, "packages/atabey-mcp/dist/atabey-mcp/src/mcp/index.js");

        await new Promise<void>((resolve, reject) => {
            const child = spawn("node", [serverEntry], {
                cwd: repoRoot,
                env: {
                    ...process.env,
                    ATABEY_PROJECT_ROOT: repoRoot,
                    MCP_TRANSPORT: "stdio",
                },
                stdio: ["pipe", "pipe", "pipe"],
            });

            let stdoutBuf = "";
            const corruptedLines: string[] = [];
            const responses = new Map<number, Record<string, unknown>>();

            const timer = setTimeout(() => {
                child.kill();
                reject(new Error(`MCP stdio test timed out. Responses: ${responses.size}, Corrupted: ${corruptedLines.join(" | ")}`));
            }, 8000);

            child.stdout.on("data", (chunk: Buffer) => {
                stdoutBuf += chunk.toString("utf8");
                const lines = stdoutBuf.split("\n");
                stdoutBuf = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line) as { id?: number; jsonrpc?: string; result?: Record<string, unknown> };
                        if (parsed.jsonrpc !== "2.0" || typeof parsed.id !== "number") {
                            corruptedLines.push(line);
                            continue;
                        }
                        responses.set(parsed.id, parsed);

                        if (parsed.id === 1) {
                            child.stdin.write(
                                JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n"
                            );
                        } else if (parsed.id === 2) {
                            child.stdin.write(
                                JSON.stringify({
                                    jsonrpc: "2.0",
                                    id: 3,
                                    method: "tools/call",
                                    params: { name: "get_framework_status", arguments: {} },
                                }) + "\n"
                            );
                        } else if (parsed.id === 3) {
                            clearTimeout(timer);
                            child.kill();
                            try {
                                expect(corruptedLines).toEqual([]);
                                expect(responses.has(1)).toBe(true);
                                expect(responses.has(2)).toBe(true);
                                expect(responses.has(3)).toBe(true);
                                const toolsRes = responses.get(2)?.result as { tools?: unknown[] } | undefined;
                                expect(toolsRes?.tools?.length).toBe(40);
                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        }
                    } catch {
                        corruptedLines.push(line);
                    }
                }
            });

            child.on("error", (err) => {
                clearTimeout(timer);
                reject(err);
            });

            child.stdin.write(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: 1,
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "stdio-purity-test", version: "1.0.0" },
                    },
                }) + "\n"
            );
        });
    }, 15000);
});
