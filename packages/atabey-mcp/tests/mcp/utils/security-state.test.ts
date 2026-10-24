import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    listActiveLoopCooldowns,
    loadDiscipline,
    loadLoopCooldown,
    persistDiscipline,
    persistLoopCooldown,
    clearPersistedLoopCooldown,
    purgeExpiredSecurityState,
} from "../../../src/mcp/modules/security/security-state.js";
import { Storage } from "atabey-shared/storage.js";

/**
 * Durable governance state.
 *
 * The point of this module is that a cooldown survives an MCP process restart:
 * without it an agent could restart the server to clear a loop-block. These
 * tests assert persistence, expiry filtering and purging against a real SQLite
 * file in a throwaway framework dir.
 */
describe("security-state (durable cooldowns)", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-secstate-"));
        process.env.ATABEY_TEST_DIR = dir;
        Storage.reset();
    });

    afterEach(() => {
        Storage.reset();
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("persists a loop cooldown and reads it back", () => {
        const until = Date.now() + 60_000;
        persistLoopCooldown("@backend", until, "10 identical calls", 3);

        const loaded = loadLoopCooldown("@backend");
        expect(loaded).not.toBeNull();
        expect(loaded?.agent).toBe("backend"); // storage normalises the @ prefix
        expect(loaded?.cooldownUntil).toBe(until);
        expect(loaded?.detail).toBe("10 identical calls");
        expect(loaded?.cooldownCount).toBe(3);
    });

    it("returns null for an agent without a cooldown", () => {
        expect(loadLoopCooldown("@frontend")).toBeNull();
    });

    it("clears a cooldown", () => {
        persistLoopCooldown("@backend", Date.now() + 60_000, "loop", 1);
        expect(clearPersistedLoopCooldown("@backend")).toBe(true);
        expect(loadLoopCooldown("@backend")).toBeNull();
    });

    it("lists only active cooldowns, skipping expired ones", () => {
        persistLoopCooldown("@backend", Date.now() + 60_000, "active", 1);
        persistLoopCooldown("@frontend", Date.now() - 60_000, "expired", 1);

        const active = listActiveLoopCooldowns();
        expect(active.map((c) => c.agent)).toEqual(["backend"]);
    });

    it("persists discipline counters and reads them back", () => {
        persistDiscipline({
            agent: "@backend",
            totalCalls: 42,
            violations: 2,
            lastViolation: "rate limit",
            cooldownUntil: Date.now() + 30_000,
        });

        const stats = loadDiscipline("@backend");
        expect(stats).not.toBeNull();
        expect(stats?.totalCalls).toBe(42);
        expect(stats?.violations).toBe(2);
        expect(stats?.lastViolation).toBe("rate limit");
    });

    it("returns null discipline for an unknown agent", () => {
        expect(loadDiscipline("@nobody")).toBeNull();
    });

    it("purges expired loop cooldowns", () => {
        persistLoopCooldown("@backend", Date.now() + 60_000, "active", 1);
        persistLoopCooldown("@frontend", Date.now() - 60_000, "expired", 1);
        persistLoopCooldown("@git", Date.now() - 120_000, "expired", 1);

        const result = purgeExpiredSecurityState();
        expect(result.loopCleared).toBe(2);
        expect(listActiveLoopCooldowns().map((c) => c.agent)).toEqual(["backend"]);
    });

    it("keeps state across a simulated process restart (Storage.reset)", () => {
        persistLoopCooldown("@backend", Date.now() + 60_000, "survives", 1);

        // Simulate an MCP restart: drop the in-process connection, then reconnect.
        Storage.reset();

        expect(loadLoopCooldown("@backend")?.detail).toBe("survives");
    });
});
