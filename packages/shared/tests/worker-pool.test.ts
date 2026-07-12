import path from "path";
import { fileURLToPath } from "url";
import { afterEach, describe, expect, it } from "vitest";
import { WorkerPool, resetDefaultWorkerPool } from "../src/worker-pool.js";

const workerScript = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/worker-thread.ts",
);

// Vitest can run TS workers via tsx? Node worker needs compiled JS.
// Use dist if present, else skip when worker script is .ts without loader.
import fs from "fs";

const distWorker = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../dist/worker-thread.js",
);

describe("WorkerPool", () => {
    afterEach(async () => {
        await resetDefaultWorkerPool();
    });

    const resolveScript = (): string | null => {
        if (fs.existsSync(distWorker)) return distWorker;
        // Fallback: allow running via vitest if node can load ts (unlikely)
        if (fs.existsSync(workerScript.replace(/\.ts$/, ".js"))) {
            return workerScript.replace(/\.ts$/, ".js");
        }
        return null;
    };

    it("runs ping jobs off the main thread with concurrency limit", async () => {
        const script = resolveScript();
        if (!script) {
            // Build shared first in CI; skip if dist missing
            console.warn("[skip] worker-thread.js not built — run npm run build -w packages/shared");
            return;
        }

        const pool = new WorkerPool({
            maxConcurrency: 2,
            minWorkers: 1,
            jobTimeoutMs: 10_000,
            workerScript: script,
        });

        try {
            const results = await Promise.all([
                pool.run("ping"),
                pool.run("hash", { text: "atabey" }),
                pool.run("tokenize", { text: "hello world from atabey" }),
            ]);

            expect(results[0]).toMatchObject({ pong: true });
            expect(results[1]).toMatchObject({ length: 6 });
            expect((results[2] as { count: number }).count).toBeGreaterThan(0);

            const stats = pool.getStats();
            expect(stats.maxConcurrency).toBe(2);
        } finally {
            await pool.close();
        }
    });

    it("times out long jobs", async () => {
        const script = resolveScript();
        if (!script) return;

        const pool = new WorkerPool({
            maxConcurrency: 1,
            minWorkers: 1,
            jobTimeoutMs: 50,
            workerScript: script,
        });

        try {
            await expect(pool.run("sleep", { ms: 2000 })).rejects.toThrow(/timed out/i);
        } finally {
            await pool.close();
        }
    });
});
