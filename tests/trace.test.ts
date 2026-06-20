import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as memoryUtils from "../src/cli/utils/memory.js";
import { traceNewCommand } from "../src/cli/commands/trace.js";
import { Storage } from "../src/shared/storage.js";

describe("Trace Command", () => {
    let tempDir: string;
    let memoryDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-trace-test-"));
        memoryDir = path.join(tempDir, "memory");
        process.env.ATABEY_TEST_DIR = tempDir;
        
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);
        
        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should successfully generate Trace ID and add task to SQLite storage", async () => {
        const description = "Implement tests";
        const traceId = await traceNewCommand(description, "manager", "P1");

        expect(traceId).toBeDefined();
        
        const tasks = Storage.getTasks();
        const task = tasks.find(t => t.description === description);
        expect(task).toBeDefined();
        expect(task!.priority).toBe("P1");
    });
});
