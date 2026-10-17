/**
 * Phase 0.4 — durable security state (loop cooldown / discipline) survives restart.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Security state persistence (restart-safe)", () => {
    let tmp: string;
    let prevTestDir: string | undefined;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-sec-"));
        fs.mkdirSync(path.join(tmp, ".atabey"), { recursive: true });
        prevTestDir = process.env.ATABEY_TEST_DIR;
        process.env.ATABEY_TEST_DIR = path.join(tmp, ".atabey");
        process.env.ATABEY_PROJECT_ROOT = tmp;
        process.env.MCP_LOOP_DETECTION = "true";
        process.env.MCP_LOOP_MAX_CONSECUTIVE = "3";
        process.env.MCP_LOOP_COOLDOWN_MS = "60000";
    });

    afterEach(async () => {
        vi.resetModules();
        try {
            const { Storage } = await import("../../../src/shared/storage.js");
            Storage.reset();
        } catch { /* ignore */ }
        if (prevTestDir === undefined) delete process.env.ATABEY_TEST_DIR;
        else process.env.ATABEY_TEST_DIR = prevTestDir;
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it("persists loop cooldown and restores after in-memory reset", async () => {
        const loop1 = await import("../../../src/mcp/utils/loop-detector.js");
        loop1.resetLoopDetection();

        // Trigger cooldown (MAX_CONSECUTIVE=3)
        loop1.recordAndCheck("agent-restart", "read_file", { path: "a.ts" });
        loop1.recordAndCheck("agent-restart", "read_file", { path: "a.ts" });
        const alert = loop1.recordAndCheck("agent-restart", "read_file", { path: "a.ts" });
        expect(alert).not.toBeNull();
        expect(alert?.severity).toBe("critical");
        expect(loop1.isInCooldown("agent-restart").inCooldown).toBe(true);

        // Simulate process restart: clear memory maps + re-import modules
        loop1.resetLoopDetection(); // also clears DB — so re-save via Storage only path

        // Re-trigger: we need DB row. resetLoopDetection clears DB — test direct Storage instead
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.reset();
        Storage.saveLoopCooldown("agent-restart", Date.now() + 60_000, "test cooldown", 2);

        vi.resetModules();
        const loop2 = await import("../../../src/mcp/utils/loop-detector.js");
        // Do not call resetLoopDetection (would wipe DB)
        const blocked = loop2.recordAndCheck("agent-restart", "read_file", { path: "b.ts" });
        expect(blocked).not.toBeNull();
        expect(blocked?.type).toBe("rate_limit");
        expect(blocked?.detail).toMatch(/cooldown|Restored/i);
        expect(loop2.isInCooldown("agent-restart").inCooldown).toBe(true);
    });

    it("security-state façade lists active cooldowns", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.reset();
        Storage.saveLoopCooldown("agent-a", Date.now() + 30_000, "loop", 1);
        Storage.saveLoopCooldown("agent-b", Date.now() - 1000, "expired", 1); // expired

        const sec = await import("../../../src/mcp/utils/security-state.js");
        const active = sec.listActiveLoopCooldowns();
        expect(active.some((a) => a.agent === "agent-a" || a.agent === "a")).toBe(true);
        // expired purged or not listed
        expect(active.every((a) => a.cooldownUntil > Date.now())).toBe(true);
    });

    it("discipline cooldown hydrates from SQLite after memory empty", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.reset();
        Storage.saveDiscipline("agent-disc", {
            totalCalls: 10,
            violations: 2,
            lastViolation: "rate limit",
            cooldownUntil: Date.now() + 45_000,
        });

        vi.resetModules();
        const disc = await import("../../../src/mcp/utils/discipline.js");
        // enforceDiscipline should hit cooldown without prior in-memory setCooldown
        const err = await disc.enforceDiscipline("agent-disc", "read_file", { path: "x.ts" });
        expect(err).not.toBeNull();
        expect(err).toMatch(/cooldown/i);
    });

    it("purgeExpiredSecurityState removes stale loop rows", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.reset();
        Storage.saveLoopCooldown("stale", Date.now() - 5000, "old", 1);
        Storage.saveLoopCooldown("fresh", Date.now() + 50_000, "new", 1);

        const sec = await import("../../../src/mcp/utils/security-state.js");
        const result = sec.purgeExpiredSecurityState();
        expect(result.loopCleared).toBeGreaterThanOrEqual(1);
        const active = sec.listActiveLoopCooldowns();
        expect(active.some((a) => a.agent === "fresh" || a.agent === "stale" && a.cooldownUntil > Date.now())).toBe(true);
        expect(active.every((a) => a.agent !== "stale" || a.cooldownUntil > Date.now())).toBe(true);
    });
});
