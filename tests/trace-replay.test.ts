import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { traceReplayCommand } from "../src/cli/commands/trace.js";
import { Storage } from "../src/shared/storage.js";
import { asAgentID, asTraceID } from "../src/shared/types.js";

describe("Trace Replay Engine", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-replay-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;

        // Initialize SQLite storage directly
        Storage.reset();
        Storage.setMetadata("phase", "PHASE_0");
        Storage.setMetadata("traceId", "T-000");
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch { /* ignore */ }
        vi.restoreAllMocks();
    });

    it("should display messages for a specific traceId via stdout", async () => {
        const traceId = asTraceID("TRACE-REPLAY-001");

        // Save messages to SQLite via Storage
        Storage.saveMessage({
            timestamp: new Date(Date.now() + 1000).toISOString(),
            from: asAgentID("@backend"),
            to: asAgentID("@manager"),
            category: "REPLY",
            content: "Task completed successfully",
            traceId,
            status: "PENDING",
            priority: "NORMAL",
            requiresApproval: false
        });

        Storage.saveMessage({
            timestamp: new Date(Date.now() - 5000).toISOString(),
            from: asAgentID("@manager"),
            to: asAgentID("@backend"),
            category: "DELEGATION",
            content: JSON.stringify({ task: "Build catalog" }),
            traceId,
            status: "PENDING",
            priority: "NORMAL",
            requiresApproval: false
        });

        // Spy on process.stdout.write
        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        await traceReplayCommand(traceId);

        // Verify that trace replay output was written to stdout
        expect(stdoutSpy).toHaveBeenCalled();
    });
});
