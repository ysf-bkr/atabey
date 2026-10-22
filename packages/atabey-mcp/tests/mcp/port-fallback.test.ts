import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * listenWithFallback is exported from the MCP server entrypoint. Importing the
 * full entrypoint has heavy side effects, so we resolve the exported helper via
 * a dynamic import of the compiled module graph in vitest (tsx transforms src).
 */
async function loadListenWithFallback() {
    const mod = await import("../../src/mcp/index.js");
    return mod.listenWithFallback as (
        server: http.Server,
        preferredPort: number,
        host: string,
        strict: boolean,
        onListening: () => void,
    ) => void;
}

function getFreePort(): Promise<number> {
    return new Promise((resolve) => {
        const probe = http.createServer();
        probe.listen(0, "127.0.0.1", () => {
            const addr = probe.address();
            const port = typeof addr === "object" && addr ? addr.port : 0;
            probe.close(() => resolve(port));
        });
    });
}

function listen(server: http.Server, port: number, host = "127.0.0.1"): Promise<void> {
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
    });
}

describe("listenWithFallback (port resilience)", () => {
    let tempDir: string;
    const servers: http.Server[] = [];

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-port-test-"));
    });

    afterEach(() => {
        for (const s of servers) s.close();
        servers.length = 0;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("falls back to the next free port when the preferred one is busy", async () => {
        const listenWithFallback = await loadListenWithFallback();

        // Occupy the preferred port.
        const preferredPort = await getFreePort();
        const blocker = http.createServer();
        servers.push(blocker);
        await listen(blocker, preferredPort);

        const server = http.createServer();
        servers.push(server);

        const boundPort = await new Promise<number>((resolve, reject) => {
            listenWithFallback(server, preferredPort, "127.0.0.1", false, () => {
                const addr = server.address();
                resolve(typeof addr === "object" && addr ? addr.port : -1);
            });
            setTimeout(() => reject(new Error("fallback listen timed out")), 5000);
        });

        expect(boundPort).toBe(preferredPort + 1);
    });

    it("keeps the preferred port when it is free", async () => {
        const listenWithFallback = await loadListenWithFallback();

        const preferredPort = await getFreePort();
        const server = http.createServer();
        servers.push(server);

        const boundPort = await new Promise<number>((resolve, reject) => {
            listenWithFallback(server, preferredPort, "127.0.0.1", false, () => {
                const addr = server.address();
                resolve(typeof addr === "object" && addr ? addr.port : -1);
            });
            setTimeout(() => reject(new Error("listen timed out")), 5000);
        });

        expect(boundPort).toBe(preferredPort);
    });
});
