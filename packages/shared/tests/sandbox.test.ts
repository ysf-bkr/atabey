import { afterEach, describe, expect, it, vi } from "vitest";
import {
    applySandboxToSpawnOptions,
    clearSandboxIdentityCache,
    resolveSandboxIdentity,
    sandboxSpawn,
} from "../src/sandbox.js";

// Root users can always setuid, so the sandbox enables; skip if root
const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
const itIfNotRoot = isRoot ? it.skip : it;
const itIfRootOrSelf = typeof process.getuid === "function" ? it : it.skip;

vi.mock("child_process", async (importOriginal) => {
    const actual = await importOriginal<typeof import("child_process")>();
    return {
        ...actual,
        spawn: vi.fn(() => ({
            on: vi.fn(),
            stdout: { on: vi.fn() },
            stderr: { on: vi.fn() },
        })),
    };
});

import { spawn } from "child_process";

describe("sandbox", () => {
    afterEach(() => {
        clearSandboxIdentityCache();
        delete process.env.ATABEY_SANDBOX_UID;
        delete process.env.ATABEY_SANDBOX_GID;
        delete process.env.ATABEY_SANDBOX_USER;
        delete process.env.ATABEY_SANDBOX_ENABLED;
        vi.clearAllMocks();
    });

    it("is disabled when no uid configured", () => {
        const id = resolveSandboxIdentity();
        expect(id.enabled).toBe(false);
        expect(id.reason).toMatch(/No ATABEY_SANDBOX/i);
    });

    it("refuses root uid", () => {
        process.env.ATABEY_SANDBOX_UID = "0";
        const id = resolveSandboxIdentity();
        expect(id.enabled).toBe(false);
        expect(id.reason).toMatch(/root/i);
    });

    itIfNotRoot("applies uid/gid when process is root-capable or same uid", () => {
        // Use current process uid so setuid is a no-op-safe path
        const uid = typeof process.getuid === "function" ? process.getuid() : 501;
        process.env.ATABEY_SANDBOX_UID = String(uid);
        process.env.ATABEY_SANDBOX_GID = "20";
        clearSandboxIdentityCache();

        const id = resolveSandboxIdentity();
        // Enabled only if we can setuid (root) OR target equals current uid
        if (typeof process.getuid === "function" && (process.getuid() === 0 || process.getuid() === uid)) {
            expect(id.enabled).toBe(true);
            const opts = applySandboxToSpawnOptions({ cwd: "/tmp" });
            expect(opts.uid).toBe(uid);
            expect(opts.gid).toBe(20);
        } else {
            // Non-root targeting different uid → disabled with reason
            expect(id.enabled).toBe(false);
        }
    });

    it("sandboxSpawn forwards to spawn with options", () => {
        const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
        if (uid !== undefined) {
            process.env.ATABEY_SANDBOX_UID = String(uid);
            clearSandboxIdentityCache();
        }
        sandboxSpawn("echo", ["hi"], { cwd: "/tmp", shell: false });
        expect(spawn).toHaveBeenCalled();
        const call = vi.mocked(spawn).mock.calls[0];
        expect(call[0]).toBe("echo");
        expect(call[1]).toEqual(["hi"]);
    });

    it("disableSandbox skips uid injection", () => {
        process.env.ATABEY_SANDBOX_UID = "501";
        clearSandboxIdentityCache();
        const opts = applySandboxToSpawnOptions({ disableSandbox: true, cwd: "." });
        expect(opts.uid).toBeUndefined();
    });
});
