import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryJobQueue, resetAgentJobQueue, getAgentJobQueue } from "../src/job-queue.js";

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
});
