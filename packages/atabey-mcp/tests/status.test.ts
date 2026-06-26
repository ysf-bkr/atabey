import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusCommand } from "../src/cli/commands/status.js";
import * as memoryUtils from "../src/cli/utils/memory.js";
import { asAgentID, asTaskID, asTraceID } from "../src/shared/types.js";

describe("Status Command", () => {
    let tempDir: string;
    let memoryDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-status-test-"));
        memoryDir = path.join(tempDir, "memory");
        process.env.ATABEY_TEST_DIR = tempDir;
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);
        vi.spyOn(memoryUtils, "readState").mockReturnValue(null as any);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should print error if memory state is missing", async () => {
        const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

        await statusCommand();

        expect(stderrSpy).toHaveBeenCalled();
        stderrSpy.mockRestore();
    });

    it("should display correctly when state and status exist", async () => {
        vi.spyOn(memoryUtils, "readState").mockReturnValue({ phase: "PHASE_1", traceId: "T-001", managerState: "ACTIVE" });
        vi.spyOn(memoryUtils, "readStatus").mockReturnValue({
            "@manager": { state: "READY", task: "Idle", lastUpdated: new Date().toISOString() },
            "@coder": { state: "EXECUTING", task: "Refactoring", lastUpdated: new Date().toISOString() }
        });
        vi.spyOn(memoryUtils, "listTasks").mockReturnValue([
            { id: asTaskID("TASK_01"), traceId: asTraceID("T-001"), priority: "P1", status: "IN_PROGRESS", description: "Test", agent: asAgentID("manager"), dependencies: [] }
        ]);

        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        await statusCommand();

        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Phase: PHASE_1"));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Trace ID: T-001"));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("@manager"));
        expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining("Refactoring"));

        stdoutSpy.mockRestore();
    });
});
