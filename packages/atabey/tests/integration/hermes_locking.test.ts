import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as memoryUtils from "../../src/cli/utils/memory.js";
import { sendMessage, orchestrateCommand } from "../../src/cli/commands/orchestrate.js";
import { Storage } from "../../src/shared/storage.js";

describe("Hermes Message Broker (SQLite) & Self-Healing", () => {
    let tempDir: string;
    let memoryDir: string;

    beforeEach(() => {
        Storage.reset();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-sqlite-test-"));
        memoryDir = path.join(tempDir, "memory");
        process.env.ATABEY_TEST_DIR = tempDir;
        
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);
        
        memoryUtils.initDocumentStore(tempDir);
        
        memoryUtils.updateDocumentStore("status", {
            "@manager": { state: "READY", task: "Idle" },
            "@backend": { state: "READY", task: "Idle" }
        });
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should handle concurrent message delivery via SQLite", async () => {
        const traceId = "stress-lock-1";
        
        // Simulate concurrent deliveries
        const deliveries = Array.from({ length: 5 }).map((_, i) => 
            sendMessage({
                from: "@manager",
                to: "@backend",
                category: "ACTION",
                content: JSON.stringify({ task: `Task ${i}` }),
                traceId: `${traceId}-${i}`
            })
        );

        await Promise.all(deliveries);

        const pending = Storage.getPendingMessages();
        expect(pending.length).toBe(5); // All messages delivered via SQLite
    });

    it("should trigger Self-Healing when an agent times out", async () => {
        // 1. Manually set an agent to EXECUTING with a stale timestamp (>30m ago)
        const staleDate = new Date(Date.now() - 31 * 60 * 1000).toISOString();
        memoryUtils.updateDocumentStore("status", {
            "@backend": { 
                state: "EXECUTING", 
                task: "Long running task", 
                lastUpdated: staleDate 
            }
        });

        // 2. Run orchestrator
        await orchestrateCommand({ maxIterations: 1 });

        // 3. Verify Self-Healing reset the agent
        const status = memoryUtils.readStatus();
        expect(status["@backend"].state).toBe("READY");
        expect(status["@backend"].task).toContain("Recovered from Timeout");
    });
});
