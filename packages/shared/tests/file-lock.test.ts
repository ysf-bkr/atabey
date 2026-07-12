import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AtomicFileLock } from "../src/file-lock.js";

describe("AtomicFileLock", () => {
    let tmp: string;
    let lock: AtomicFileLock;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-lock-"));
        lock = new AtomicFileLock({
            projectRoot: tmp,
            locksDir: path.join(tmp, ".atabey", "locks"),
            ttlMs: 200,
            retryMs: 20,
            timeoutMs: 500,
        });
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it("acquires with exclusive wx and blocks second owner", () => {
        const a = lock.tryAcquire("states/agent_1.json", "agent-1");
        expect(a.acquired).toBe(true);
        expect(fs.existsSync(lock.getLockPath("states/agent_1.json"))).toBe(true);

        const b = lock.tryAcquire("states/agent_1.json", "agent-2");
        expect(b.acquired).toBe(false);
        expect(b.heldBy?.ownerId).toBe("agent-1");
    });

    it("releases and allows re-acquire", () => {
        expect(lock.tryAcquire("foo.txt", "a").acquired).toBe(true);
        expect(lock.release("foo.txt", "a")).toBe(true);
        expect(lock.tryAcquire("foo.txt", "b").acquired).toBe(true);
        lock.release("foo.txt", "b");
    });

    it("does not release another owner's lock", () => {
        lock.tryAcquire("bar.txt", "owner");
        expect(lock.release("bar.txt", "intruder")).toBe(false);
        expect(lock.isLocked("bar.txt")?.ownerId).toBe("owner");
        lock.release("bar.txt", "owner");
    });

    it("reclaims stale locks after TTL", async () => {
        expect(lock.tryAcquire("stale.txt", "old").acquired).toBe(true);
        await new Promise((r) => setTimeout(r, 250));
        const again = lock.tryAcquire("stale.txt", "new");
        expect(again.acquired).toBe(true);
        expect(again.meta?.ownerId).toBe("new");
        lock.release("stale.txt", "new");
    });

    it("withLock always releases", async () => {
        await expect(
            lock.withLock("x.txt", "w", async () => {
                throw new Error("inside");
            }),
        ).rejects.toThrow("inside");
        expect(lock.isLocked("x.txt")).toBeNull();
    });

    it("acquireAsync times out when held", async () => {
        lock.tryAcquire("wait.txt", "holder");
        await expect(
            lock.acquireAsync("wait.txt", "waiter", { timeoutMs: 80, retryMs: 20 }),
        ).rejects.toThrow(/Timeout/i);
        lock.release("wait.txt", "holder");
    });

    it("acquireAsync succeeds after release", async () => {
        lock.tryAcquire("async.txt", "a");
        setTimeout(() => lock.release("async.txt", "a"), 40);
        const meta = await lock.acquireAsync("async.txt", "b", { timeoutMs: 500, retryMs: 15 });
        expect(meta.ownerId).toBe("b");
        lock.release("async.txt", "b");
    });
});
