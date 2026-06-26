import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DistributedLock } from "../../src/shared/lock.js";
import { Storage } from "../../src/shared/storage.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-lock-test-" + Date.now());

describe("DistributedLock Service", () => {
    beforeAll(() => {
        process.env.ATABEY_TEST_DIR = TEST_DIR;
        fs.mkdirSync(path.join(TEST_DIR, "logs"), { recursive: true });
        Storage.setMetadata("phase", "PHASE_0");
        DistributedLock.initialize();
    });

    afterAll(() => {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
    });

    it("should acquire and release a lock", () => {
        const resource = "src/modules/agents/definitions.ts";
        const owner = "test-agent-1";

        // Lock should be available initially
        expect(DistributedLock.isLocked(resource)).toBe(false);

        // Acquire lock
        const acquired = DistributedLock.acquire(resource, owner, {
            ttlMs: 5000,
            reason: "Refactoring code",
            traceId: "T-100",
        });
        expect(acquired).toBe(true);
        expect(DistributedLock.isLocked(resource)).toBe(true);

        // Retrieve lock details
        const lockInfo = DistributedLock.getLock(resource);
        expect(lockInfo).not.toBeNull();
        expect(lockInfo?.ownerId).toBe(owner);
        expect(lockInfo?.reason).toBe("Refactoring code");
        expect(lockInfo?.traceId).toBe("T-100");

        // Release lock
        const released = DistributedLock.release(resource, owner);
        expect(released).toBe(true);
        expect(DistributedLock.isLocked(resource)).toBe(false);
    });

    it("should not allow another owner to acquire an active lock", () => {
        const resource = "src/modules/engines/routing-engine.ts";
        const owner1 = "test-agent-1";
        const owner2 = "test-agent-2";

        // Owner 1 acquires lock
        expect(DistributedLock.acquire(resource, owner1, { ttlMs: 10000 })).toBe(true);

        // Owner 2 fails to acquire lock
        expect(DistributedLock.acquire(resource, owner2, { ttlMs: 10000 })).toBe(false);

        // Owner 2 cannot release Owner 1's lock
        expect(DistributedLock.release(resource, owner2)).toBe(false);
        expect(DistributedLock.isLocked(resource)).toBe(true);

        // Owner 1 releases lock
        expect(DistributedLock.release(resource, owner1)).toBe(true);
        expect(DistributedLock.isLocked(resource)).toBe(false);
    });

    it("should override existing lock with force option", () => {
        const resource = "src/shared/logger.ts";
        const owner1 = "test-agent-1";
        const owner2 = "test-agent-2";

        // Owner 1 acquires lock
        expect(DistributedLock.acquire(resource, owner1, { ttlMs: 10000 })).toBe(true);

        // Owner 2 forces lock acquisition
        expect(DistributedLock.acquire(resource, owner2, { ttlMs: 10000, force: true })).toBe(true);

        // Lock owner should be owner 2 now
        const info = DistributedLock.getLock(resource);
        expect(info?.ownerId).toBe(owner2);

        // Clean up
        DistributedLock.release(resource, owner2);
    });

    it("should list active locks and owner locks", () => {
        const res1 = "resource-1";
        const res2 = "resource-2";
        const owner = "owner-multi";

        DistributedLock.acquire(res1, owner, { ttlMs: 10000 });
        DistributedLock.acquire(res2, owner, { ttlMs: 10000 });

        const activeLocks = DistributedLock.listActiveLocks();
        const ownerLocks = DistributedLock.listOwnerLocks(owner);

        expect(activeLocks.length).toBeGreaterThanOrEqual(2);
        expect(ownerLocks.length).toBe(2);

        // Clean up all by owner
        const releasedCount = DistributedLock.releaseAllByOwner(owner);
        expect(releasedCount).toBe(2);
        expect(DistributedLock.isLocked(res1)).toBe(false);
        expect(DistributedLock.isLocked(res2)).toBe(false);
    });

    it("should get a local owner ID", () => {
        const localId = DistributedLock.getLocalOwnerId();
        expect(localId).toBeDefined();
        expect(typeof localId).toBe("string");
        expect(localId.length).toBeGreaterThan(0);
    });
});
