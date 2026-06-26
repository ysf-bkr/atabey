import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as memoryUtils from "../src/cli/utils/memory.js";

describe("Memory Utilities", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-memory-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(path.join(tempDir, "memory"));
        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    describe("Framework Directories", () => {
        it("should fallback to .gemini directory if no config is found", () => {
            const frameworkDir = memoryUtils.getLocalFrameworkDir();
            expect(frameworkDir).toContain(".atabey");
        });
    });

    describe("Memory Lock", () => {
        it("should acquire and release lock successfully", () => {
            const lockFile = path.join(tempDir, "memory.lock");
            const locked = memoryUtils.acquireMemoryLock(lockFile);
            expect(locked).toBe(true);
            expect(fs.existsSync(lockFile)).toBe(true);

            memoryUtils.releaseMemoryLock(lockFile);
            expect(fs.existsSync(lockFile)).toBe(false);
        });

        it("should break stale lock if age is greater than 10 seconds", () => {
            const lockFile = path.join(tempDir, "memory.lock");
            fs.writeFileSync(lockFile, "locked");
            const pastTime = (Date.now() - 15000) / 1000;
            fs.utimesSync(lockFile, pastTime, pastTime);

            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
            const locked = memoryUtils.acquireMemoryLock(lockFile);
            expect(locked).toBe(true);
            consoleWarnSpy.mockRestore();
        });
    });

    describe("initializeMemory", () => {
        it("should create state.json and status.json in memory dir", () => {
            const statePath = path.join(tempDir, "memory", "state.json");
            const statusPath = path.join(tempDir, "memory", "status.json");

            memoryUtils.initializeMemory(tempDir, false);

            expect(fs.existsSync(statePath)).toBe(true);
            expect(fs.existsSync(statusPath)).toBe(true);

            const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
            expect(state.phase).toBe("PHASE_0");
        });
    });
});
