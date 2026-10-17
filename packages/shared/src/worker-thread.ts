/**
 * Generic worker_threads entrypoint for Atabey WorkerPool.
 * Receives serializable jobs and returns serializable results.
 *
 * Supported job types (extensible):
 *  - "ping"     — health check
 *  - "hash"     — simple string hash (CPU sample)
 *  - "tokenize"  — tokenization for TF-IDF style work
 *  - "sleep"    — test helper
 */

import { parentPort } from "worker_threads";

export interface WorkerJob {
    id: string;
    type: string;
    payload?: unknown;
}

export interface WorkerResult {
    id: string;
    ok: boolean;
    result?: unknown;
    error?: string;
}

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length > 1);
}

function simpleHash(input: string): number {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
        h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
    }
    return h >>> 0;
}

async function handleJob(job: WorkerJob): Promise<unknown> {
    switch (job.type) {
        case "ping":
            return { pong: true, pid: process.pid, ts: Date.now() };

        case "hash": {
            const text = String((job.payload as { text?: string })?.text ?? "");
            return { hash: simpleHash(text), length: text.length };
        }

        case "tokenize": {
            const text = String((job.payload as { text?: string })?.text ?? "");
            const tokens = tokenize(text);
            return { tokens, count: tokens.length };
        }

        case "sleep": {
            const ms = Math.min(
                10_000,
                Math.max(0, Number((job.payload as { ms?: number })?.ms ?? 0)),
            );
            await new Promise((r) => setTimeout(r, ms));
            return { slept: ms };
        }

        default:
            throw new Error(`Unknown worker job type: ${job.type}`);
    }
}

if (parentPort) {
    parentPort.on("message", (job: WorkerJob) => {
        void (async () => {
            try {
                const result = await handleJob(job);
                const msg: WorkerResult = { id: job.id, ok: true, result };
                parentPort!.postMessage(msg);
            } catch (err) {
                const msg: WorkerResult = {
                    id: job.id,
                    ok: false,
                    error: err instanceof Error ? err.message : String(err),
                };
                parentPort!.postMessage(msg);
            }
        })();
    });
}
