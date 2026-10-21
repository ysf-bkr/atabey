/**
 * Job Queue — concurrency-limited async work dispatcher backed by SQLite database persistence.
 *
 * Prevents unbounded parallel LLM / agent work from ballooning memory
 * or starving the main event loop. Job lifecycles (pending, running, completed, failed)
 * are recorded in the database when initialized, providing persistence and auditability.
 */

import os from "os";
import { databaseHolder } from "../storage/database.js";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobRecord {
    id: number;
    queue_name: string;
    payload: string;
    status: JobStatus;
    retries: number;
    max_retries: number;
    error_message?: string | null;
    created_at: string;
    updated_at: string;
}

export interface EnqueueOptions {
    /** Optional JSON-serializable payload or description of the task */
    payload?: unknown;
    /** Max retries before permanent failure (default: 3) */
    maxRetries?: number;
}

export interface JobQueueOptions {
    /** Max concurrent running jobs. Default: os.cpus().length (min 1, max 16). */
    maxConcurrency?: number;
    /** Optional name for diagnostics and DB tracking. */
    name?: string;
    /** Called when a job fails (after the promise rejects to the caller). */
    onError?: (error: unknown, jobId: number) => void;
}

interface QueueItem<T> {
    id: number;
    dbId?: number;
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

export class JobQueue {
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
     * If SQLite is initialized, records job creation in the database.
     */
    public enqueue<T>(fn: () => Promise<T>, options?: EnqueueOptions): Promise<T> {
        if (this.closed) {
            return Promise.reject(new Error(`[JobQueue:${this.name}] Queue is closed; cannot accept new jobs.`));
        }

        let dbId: number | undefined;
        if (databaseHolder.hasDB()) {
            try {
                const db = databaseHolder.getDB();
                const payloadStr = typeof options?.payload === "string"
                    ? options.payload
                    : JSON.stringify(options?.payload ?? null);
                const res = db.prepare(
                    `INSERT INTO job_queue (queue_name, payload, status, retries, max_retries, created_at, updated_at)
                     VALUES (?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
                ).run(this.name, payloadStr, options?.maxRetries ?? 3);
                dbId = Number(res.lastInsertRowid);
            } catch {
                // Table might not exist yet if running pre-migration
            }
        }

        return new Promise<T>((resolve, reject) => {
            const item: QueueItem<T> = {
                id: this.nextId++,
                dbId,
                run: fn,
                resolve,
                reject,
            };
            this.pending.push(item as QueueItem<unknown>);
            this.pump();
        });
    }

    /** Retrieve a job record from the database by ID. */
    public getJobRecord(id: number): JobRecord | null {
        if (!databaseHolder.hasDB()) return null;
        try {
            const db = databaseHolder.getDB();
            return (db.prepare("SELECT * FROM job_queue WHERE id = ?").get(id) as JobRecord) || null;
        } catch {
            return null;
        }
    }

    /** Retrieve job records from the database for this queue. */
    public getQueueRecords(status?: JobStatus, limit = 50): JobRecord[] {
        if (!databaseHolder.hasDB()) return [];
        try {
            const db = databaseHolder.getDB();
            if (status) {
                return db.prepare(
                    "SELECT * FROM job_queue WHERE queue_name = ? AND status = ? ORDER BY id DESC LIMIT ?"
                ).all(this.name, status, limit) as JobRecord[];
            }
            return db.prepare(
                "SELECT * FROM job_queue WHERE queue_name = ? ORDER BY id DESC LIMIT ?"
            ).all(this.name, limit) as JobRecord[];
        } catch {
            return [];
        }
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
        if (item.dbId && databaseHolder.hasDB()) {
            try {
                const db = databaseHolder.getDB();
                db.prepare(
                    "UPDATE job_queue SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                ).run(item.dbId);
            } catch {
                // Ignore DB error during execution transition
            }
        }

        try {
            const result = await item.run();
            this.completed++;

            if (item.dbId && databaseHolder.hasDB()) {
                try {
                    const db = databaseHolder.getDB();
                    db.prepare(
                        "UPDATE job_queue SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    ).run(item.dbId);
                } catch {
                    // Ignore DB error
                }
            }

            item.resolve(result);
        } catch (error) {
            this.failed++;

            if (item.dbId && databaseHolder.hasDB()) {
                try {
                    const db = databaseHolder.getDB();
                    const errMsg = error instanceof Error ? error.message : String(error);
                    db.prepare(
                        "UPDATE job_queue SET status = 'failed', error_message = ?, retries = retries + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    ).run(errMsg, item.dbId);
                } catch {
                    // Ignore DB error
                }
            }

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

/** Backward compatibility alias */
export { JobQueue as InMemoryJobQueue };

/** Shared singleton for agent orchestration (lazy). */
let agentJobQueue: JobQueue | null = null;

export function getAgentJobQueue(options?: JobQueueOptions): JobQueue {
    if (!agentJobQueue) {
        const fromEnv = process.env.ATABEY_JOB_CONCURRENCY
            ? parseInt(process.env.ATABEY_JOB_CONCURRENCY, 10)
            : undefined;
        agentJobQueue = new JobQueue({
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

