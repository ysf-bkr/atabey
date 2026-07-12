/**
 * [ENGINE] Worker Pool — re-exports shared in-memory worker pool + job queue.
 *
 * Domain note: Hermes/SQLite agent state stays on the main thread (AgentLoop +
 * InMemoryJobQueue). Use WorkerPool only for isolable CPU work (tokenize, hash, …).
 */

export {
    WorkerPool,
    getDefaultWorkerPool,
    resetDefaultWorkerPool,
    type WorkerPoolOptions,
} from "atabey-shared/worker-pool.js";

export {
    InMemoryJobQueue,
    getAgentJobQueue,
    resetAgentJobQueue,
    type JobQueueOptions,
    type JobQueueStats,
} from "atabey-shared/job-queue.js";
