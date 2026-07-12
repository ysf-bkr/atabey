/**
 * In-Memory Worker Pool — worker_threads based, no Redis/BullMQ.
 *
 * Heavy / isolable work runs off the main thread. Concurrency is capped
 * (default os.cpus().length) via an internal queue so RAM/CPU stay bounded.
 */

import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { Worker } from "worker_threads";
import type { WorkerJob, WorkerResult } from "./worker-thread.js";

export interface WorkerPoolOptions {
    /** Max concurrent worker jobs. Default: os.cpus().length (clamped 1–16). */
    maxConcurrency?: number;
    /** Idle workers retained in the pool. Default: min(2, maxConcurrency). */
    minWorkers?: number;
    /** Per-job timeout in ms. Default: 30_000. */
    jobTimeoutMs?: number;
    /** Optional absolute path to worker script (tests / monorepo layouts). */
    workerScript?: string;
}

interface PendingJob {
    job: WorkerJob;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout>;
}

interface PoolWorker {
    worker: Worker;
    busy: boolean;
    /** Job id currently handled by this worker (if any). */
    currentJobId: string | null;
}

function defaultWorkerScript(): string {
    // Compiled ESM layout: dist/worker-thread.js next to this module
    const here = path.dirname(fileURLToPath(import.meta.url));
    return path.join(here, "worker-thread.js");
}

export class WorkerPool {
    private readonly maxConcurrency: number;
    private readonly minWorkers: number;
    private readonly jobTimeoutMs: number;
    private readonly workerScript: string;
    private readonly workers: PoolWorker[] = [];
    private readonly queue: PendingJob[] = [];
    private readonly inflight = new Map<string, PendingJob>();
    private jobSeq = 0;
    private closed = false;

    constructor(options: WorkerPoolOptions = {}) {
        const cpus = Math.max(1, os.cpus()?.length || 1);
        const requested = options.maxConcurrency ?? cpus;
        this.maxConcurrency = Math.max(1, Math.min(requested, 16));
        this.minWorkers = Math.max(
            0,
            Math.min(options.minWorkers ?? Math.min(2, this.maxConcurrency), this.maxConcurrency),
        );
        this.jobTimeoutMs = options.jobTimeoutMs ?? 30_000;
        this.workerScript = options.workerScript ?? defaultWorkerScript();

        for (let i = 0; i < this.minWorkers; i++) {
            this.spawnWorker();
        }
    }

    /**
     * Run a named job type on a worker thread.
     * Returns when the worker posts a result (or on timeout/error).
     */
    public run<T = unknown>(type: string, payload?: unknown): Promise<T> {
        if (this.closed) {
            return Promise.reject(new Error("[WorkerPool] Pool is closed."));
        }

        const id = `wjob-${++this.jobSeq}-${Date.now()}`;
        const job: WorkerJob = { id, type, payload };

        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => {
                this.inflight.delete(id);
                reject(new Error(`[WorkerPool] Job ${id} timed out after ${this.jobTimeoutMs}ms`));
            }, this.jobTimeoutMs);

            const pending: PendingJob = {
                job,
                resolve: (v) => resolve(v as T),
                reject,
                timer,
            };

            this.queue.push(pending);
            this.dispatch();
        });
    }

    public getStats(): {
        maxConcurrency: number;
        workers: number;
        busy: number;
        pending: number;
        inflight: number;
    } {
        return {
            maxConcurrency: this.maxConcurrency,
            workers: this.workers.length,
            busy: this.workers.filter((w) => w.busy).length,
            pending: this.queue.length,
            inflight: this.inflight.size,
        };
    }

    public async close(): Promise<void> {
        this.closed = true;
        while (this.queue.length > 0) {
            const p = this.queue.shift();
            if (p) {
                clearTimeout(p.timer);
                p.reject(new Error("[WorkerPool] Pool closed while job was queued."));
            }
        }
        await Promise.all(
            this.workers.map(
                (pw) =>
                    new Promise<void>((resolve) => {
                        pw.worker.once("exit", () => resolve());
                        void pw.worker.terminate();
                    }),
            ),
        );
        this.workers.length = 0;
    }

    private failWorkerJob(pw: PoolWorker, error: Error): void {
        const jobId = pw.currentJobId;
        pw.busy = false;
        pw.currentJobId = null;
        if (!jobId) return;
        const pending = this.inflight.get(jobId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.inflight.delete(jobId);
        pending.reject(error);
    }

    private spawnWorker(): PoolWorker {
        const worker = new Worker(this.workerScript);
        const pw: PoolWorker = { worker, busy: false, currentJobId: null };

        worker.on("message", (msg: WorkerResult) => {
            const pending = this.inflight.get(msg.id);
            pw.busy = false;
            pw.currentJobId = null;
            if (!pending) {
                this.dispatch();
                return;
            }
            clearTimeout(pending.timer);
            this.inflight.delete(msg.id);
            if (msg.ok) {
                pending.resolve(msg.result);
            } else {
                pending.reject(new Error(msg.error || "Worker job failed"));
            }
            this.dispatch();
        });

        worker.on("error", (err) => {
            this.failWorkerJob(
                pw,
                err instanceof Error ? err : new Error(String(err)),
            );
            this.removeWorker(pw);
            if (!this.closed) {
                this.spawnWorker();
            }
            this.dispatch();
        });

        worker.on("exit", (code) => {
            if (pw.busy && pw.currentJobId) {
                this.failWorkerJob(
                    pw,
                    new Error(`[WorkerPool] Worker exited with code ${code} while running job ${pw.currentJobId}`),
                );
            }
            this.removeWorker(pw);
            if (!this.closed && code !== 0) {
                // Replace crashed worker so pool size recovers
                if (this.workers.length < this.minWorkers) {
                    this.spawnWorker();
                }
            }
            this.dispatch();
        });

        this.workers.push(pw);
        return pw;
    }

    private removeWorker(pw: PoolWorker): void {
        const idx = this.workers.indexOf(pw);
        if (idx >= 0) this.workers.splice(idx, 1);
    }

    private dispatch(): void {
        if (this.closed) return;

        while (this.queue.length > 0) {
            let free = this.workers.find((w) => !w.busy);

            if (!free && this.workers.length < this.maxConcurrency) {
                free = this.spawnWorker();
            }
            if (!free) break;

            const pending = this.queue.shift();
            if (!pending) break;

            free.busy = true;
            free.currentJobId = pending.job.id;
            this.inflight.set(pending.job.id, pending);
            free.worker.postMessage(pending.job);
        }
    }
}

let defaultPool: WorkerPool | null = null;

export function getDefaultWorkerPool(options?: WorkerPoolOptions): WorkerPool {
    if (!defaultPool) {
        const fromEnv = process.env.ATABEY_WORKER_CONCURRENCY
            ? parseInt(process.env.ATABEY_WORKER_CONCURRENCY, 10)
            : undefined;
        defaultPool = new WorkerPool({
            maxConcurrency: options?.maxConcurrency ?? (Number.isFinite(fromEnv) ? fromEnv : undefined),
            ...options,
        });
    }
    return defaultPool;
}

export async function resetDefaultWorkerPool(): Promise<void> {
    if (defaultPool) {
        await defaultPool.close();
        defaultPool = null;
    }
}
