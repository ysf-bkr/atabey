import http from "node:http";
import readline from "node:readline";

export interface HubHealth {
    status: string;
    version: string;
    sessions: number;
    transport?: string;
}

/**
 * Checks if a primary Atabey MCP Hub is already healthy on the given port.
 */
export async function probeHubHealth(port: number = 5858, host: string = "127.0.0.1", timeoutMs: number = 300): Promise<HubHealth | null> {
    return new Promise((resolve) => {
        const req = http.get(
            {
                host,
                port,
                path: "/mcp/health",
                timeout: timeoutMs,
            },
            (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    resolve(null);
                    return;
                }
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (chunk: string) => { body += chunk; });
                res.on("end", () => {
                    try {
                        const parsed = JSON.parse(body) as HubHealth;
                        if (parsed && parsed.status === "ok") {
                            resolve(parsed);
                        } else {
                            resolve(null);
                        }
                    } catch {
                        resolve(null);
                    }
                });
            }
        );

        req.on("timeout", () => {
            req.destroy();
            resolve(null);
        });

        req.on("error", () => {
            resolve(null);
        });
    });
}

/**
 * Runs a transparent stdio bridge connected to the primary Hub on port 5858.
 * Translates local stdin/stdout JSON-RPC to the central Hub via MCP SSE protocol.
 */
export async function runStdioBridge(port: number = 5858, host: string = "127.0.0.1"): Promise<void> {
    process.stderr.write(`[atabey-mcp] Attaching to Primary Hub at http://${host}:${port}/mcp/sse (Bridge mode)...\n`);

    return new Promise((resolve, reject) => {
        let postEndpoint = "";
        const pendingQueue: string[] = [];
        let isReady = false;

        const sseReq = http.request(
            {
                host,
                port,
                path: "/mcp/sse",
                method: "GET",
                headers: {
                    Accept: "text/event-stream",
                    "Cache-Control": "no-cache",
                },
            },
            (sseRes) => {
                if (sseRes.statusCode !== 200) {
                    process.stderr.write(`[atabey-mcp] Bridge connection failed with status ${sseRes.statusCode}\n`);
                    reject(new Error(`Failed to connect to SSE stream: ${sseRes.statusCode}`));
                    return;
                }

                process.stderr.write(`[atabey-mcp] Bridge connected to Primary Hub. Stdio JSON-RPC active.\n`);

                let buffer = "";
                let currentEvent = "";

                sseRes.setEncoding("utf8");
                sseRes.on("data", (chunk: string) => {
                    buffer += chunk;
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith("event:")) {
                            currentEvent = trimmed.slice(6).trim();
                        } else if (trimmed.startsWith("data:")) {
                            const data = trimmed.slice(5).trim();
                            if (currentEvent === "endpoint") {
                                postEndpoint = data;
                                isReady = true;
                                while (pendingQueue.length > 0) {
                                    const msg = pendingQueue.shift()!;
                                    sendPostMessage(msg);
                                }
                            } else if (currentEvent === "message") {
                                process.stdout.write(data + "\n");
                            }
                        } else if (trimmed === "") {
                            currentEvent = "";
                        }
                    }
                });

                sseRes.on("close", () => {
                    process.stderr.write("[atabey-mcp] Primary Hub closed connection.\n");
                    resolve();
                });
            }
        );

        sseReq.on("error", (err) => {
            process.stderr.write(`[atabey-mcp] Bridge error: ${err.message}\n`);
            reject(err);
        });

        sseReq.end();

        function sendPostMessage(payload: string) {
            if (!postEndpoint) return;
            const postReq = http.request(
                {
                    host,
                    port,
                    path: postEndpoint,
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Length": Buffer.byteLength(payload),
                    },
                },
                (postRes) => {
                    postRes.resume();
                }
            );

            postReq.on("error", (err) => {
                process.stderr.write(`[atabey-mcp] Bridge POST error: ${err.message}\n`);
            });

            postReq.write(payload);
            postReq.end();
        }

        const rl = readline.createInterface({
            input: process.stdin,
            terminal: false,
        });

        rl.on("line", (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;
            if (isReady && postEndpoint) {
                sendPostMessage(trimmed);
            } else {
                pendingQueue.push(trimmed);
            }
        });

        rl.on("close", () => {
            sseReq.destroy();
            resolve();
        });
    });
}
