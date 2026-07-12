/**
 * In-Memory Job Queue — concurrency-limited async work dispatcher.
 *
 * Prevents unbounded parallel LLM / agent work from ballooning memory
 * or starving the main event loop. No Redis / BullMQ required.
 *
 * Jobs run on the calling process (async functions). Pair with WorkerPool
 * when true thread isolation is needed for CPU-bound work.
 */

import os from "os";

export interface JobQueueOptions {
    /** Max concurrent running jobs. Default: os.cpus().length (min 1, max 16). */
    maxConcurrency?: number;
    /** Optional name for diagnostics. */
    name?: string;
    /** Called when a job fails (after the promise rejects to the caller). */
    onError?: (error: unknown, jobId: number) => void;
}

interface QueueItem<T> {
    id: number;
    run: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason?: unknown) => void;
}

export interface JobQueueStats {
    name: string;
    maxConcurrency: number;
    running: number;
    pending: number;
    completed: number;
    failed: number;
}

export class InMemoryJobQueue {
    private readonly maxConcurrency: number;
    private readonly name: string;
    private readonly onError?: (error: unknown, jobId: number) => void;
    private readonly pending: Array<QueueItem<unknown>> = [];
    private running = 0;
    private nextId = 1;
    private completed = 0;
    private failed = 0;
    private closed = false;

    constructor(options: JobQueueOptions = {}) {
        const cpus = Math.max(1, os.cpus()?.length || 1);
        const requested = options.maxConcurrency ?? cpus;
        this.maxConcurrency = Math.max(1, Math.min(requested, 16));
        this.name = options.name ?? "default";
        this.onError = options.onError;
    }

    /**
     * Enqueue an async job. Resolves/rejects with the job result.
     * Back-pressures via wait in the queue — does not spawn unbounded work.
     */
    public enqueue<T>(fn: () => Promise<T>): Promise<T> {
        if (this.closed) {
            return Promise.reject(new Error(`[JobQueue:${this.name}] Queue is closed; cannot accept new jobs.`));
        }

        return new Promise<T>((resolve, reject) => {
            const item: QueueItem<T> = {
                id: this.nextId++,
                run: fn,
                resolve,
                reject,
            };
            this.pending.push(item as QueueItem<unknown>);
            this.pump();
        });
    }

    /** Current queue diagnostics. */
    public getStats(): JobQueueStats {
        return {
            name: this.name,
            maxConcurrency: this.maxConcurrency,
            running: this.running,
            pending: this.pending.length,
            completed: this.completed,
            failed: this.failed,
        };
    }

    /** Reject pending jobs and stop accepting new ones. In-flight jobs finish. */
    public close(reason = "Queue closed"): void {
        this.closed = true;
        while (this.pending.length > 0) {
            const item = this.pending.shift();
            item?.reject(new Error(`[JobQueue:${this.name}] ${reason}`));
        }
    }

    /** Wait until running + pending reach zero (or timeout). */
    public async drain(timeoutMs = 30_000): Promise<void> {
        const start = Date.now();
        while (this.running > 0 || this.pending.length > 0) {
            if (Date.now() - start > timeoutMs) {
                throw new Error(`[JobQueue:${this.name}] drain timed out after ${timeoutMs}ms`);
            }
            await new Promise((r) => setTimeout(r, 10));
        }
    }

    private pump(): void {
        while (this.running < this.maxConcurrency && this.pending.length > 0) {
            const item = this.pending.shift();
            if (!item) break;
            this.running++;
            void this.execute(item);
        }
    }

    private async execute(item: QueueItem<unknown>): Promise<void> {
        try {
            const result = await item.run();
            this.completed++;
            item.resolve(result);
        } catch (error) {
            this.failed++;
            try {
                this.onError?.(error, item.id);
            } catch {
                // ignore listener errors
            }
            item.reject(error);
        } finally {
            this.running--;
            this.pump();
        }
    }
}

/** Shared singleton for agent orchestration (lazy). */
let agentJobQueue: InMemoryJobQueue | null = null;

export function getAgentJobQueue(options?: JobQueueOptions): InMemoryJobQueue {
    if (!agentJobQueue) {
        const fromEnv = process.env.ATABEY_JOB_CONCURRENCY
            ? parseInt(process.env.ATABEY_JOB_CONCURRENCY, 10)
            : undefined;
        agentJobQueue = new InMemoryJobQueue({
            name: "agent",
            maxConcurrency: options?.maxConcurrency ?? (Number.isFinite(fromEnv) ? fromEnv : undefined),
            onError: options?.onError,
        });
    }
    return agentJobQueue;
}

/** Test helper — reset singleton. */
export function resetAgentJobQueue(): void {
    agentJobQueue?.close("reset");
    agentJobQueue = null;
}
