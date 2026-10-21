import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryJobQueue, resetAgentJobQueue, getAgentJobQueue } from "../src/modules/concurrency/job-queue.js";

describe("InMemoryJobQueue", () => {
    afterEach(() => {
        resetAgentJobQueue();
    });

    it("limits concurrency and drains in order of capacity", async () => {
        const queue = new InMemoryJobQueue({ maxConcurrency: 2, name: "test" });
        let concurrent = 0;
        let peak = 0;

        const mkJob = (ms: number, value: number) =>
            queue.enqueue(async () => {
                concurrent++;
                peak = Math.max(peak, concurrent);
                await new Promise((r) => setTimeout(r, ms));
                concurrent--;
                return value;
            });

        const results = await Promise.all([mkJob(40, 1), mkJob(40, 2), mkJob(10, 3), mkJob(10, 4)]);

        expect(results).toEqual([1, 2, 3, 4]);
        expect(peak).toBeLessThanOrEqual(2);
        expect(queue.getStats().completed).toBe(4);
        expect(queue.getStats().running).toBe(0);
        expect(queue.getStats().pending).toBe(0);
    });

    it("rejects new jobs after close", async () => {
        const queue = new InMemoryJobQueue({ maxConcurrency: 1 });
        queue.close("shutdown");
        await expect(queue.enqueue(async () => 1)).rejects.toThrow(/closed/i);
    });

    it("propagates job errors to the caller", async () => {
        const queue = new InMemoryJobQueue({ maxConcurrency: 1 });
        await expect(
            queue.enqueue(async () => {
                throw new Error("boom");
            }),
        ).rejects.toThrow("boom");
        expect(queue.getStats().failed).toBe(1);
    });

    it("getAgentJobQueue returns a singleton", () => {
        const a = getAgentJobQueue({ maxConcurrency: 2 });
        const b = getAgentJobQueue();
        expect(a).toBe(b);
        expect(a.getStats().name).toBe("agent");
    });

    it("onError is invoked on failure", async () => {
        const onError = vi.fn();
        const queue = new InMemoryJobQueue({ maxConcurrency: 1, onError });
        await expect(
            queue.enqueue(async () => {
                throw new Error("x");
            }),
        ).rejects.toThrow("x");
        expect(onError).toHaveBeenCalledOnce();
    });

    it("persists job lifecycles to SQLite database when database is initialized", async () => {
        const Database = (await import("better-sqlite3")).default;
        const { runPendingMigrations } = await import("../src/modules/storage/migrations.js");
        const { databaseHolder } = await import("../src/modules/storage/database.js");
        const { JobQueue } = await import("../src/modules/concurrency/job-queue.js");

        const db = new Database(":memory:");
        runPendingMigrations(db);
        databaseHolder.setDB(db);

        const queue = new JobQueue({ maxConcurrency: 2, name: "db-test" });

        // Enqueue successful job
        const res = await queue.enqueue(async () => {
            return "db-success";
        }, { payload: { action: "sync_memory" } });
        expect(res).toBe("db-success");

        const records = queue.getQueueRecords("completed");
        expect(records.length).toBeGreaterThanOrEqual(1);
        expect(records[0].status).toBe("completed");
        expect(JSON.parse(records[0].payload)).toEqual({ action: "sync_memory" });

        // Enqueue failing job
        await expect(
            queue.enqueue(async () => {
                throw new Error("db-failure");
            }, { payload: { action: "fail_test" } })
        ).rejects.toThrow("db-failure");

        const failedRecords = queue.getQueueRecords("failed");
        expect(failedRecords.length).toBeGreaterThanOrEqual(1);
        expect(failedRecords[0].status).toBe("failed");
        expect(failedRecords[0].error_message).toContain("db-failure");
        expect(failedRecords[0].retries).toBe(1);

        db.close();
    });
});

