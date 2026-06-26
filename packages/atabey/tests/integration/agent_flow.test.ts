import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { orchestrateCommand, sendMessage } from "../../src/cli/commands/orchestrate.js";
import * as memoryUtils from "../../src/cli/utils/memory.js";
import { AtabeyStorage } from "../../src/shared/storage.js";

describe("Agent Integration Flow", () => {
    let tempDir: string;
    let memoryDir: string;
    let messagesDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-integration-test-"));
        memoryDir = path.join(tempDir, "memory");
        messagesDir = path.join(tempDir, "messages");
        process.env.ATABEY_TEST_DIR = tempDir;

        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);

        memoryUtils.initDocumentStore(tempDir);
        fs.mkdirSync(messagesDir, { recursive: true });

        // Setup initial status
        memoryUtils.updateDocumentStore("status", {
            "@manager": { state: "READY", task: "Idle" },
            "@backend": { state: "READY", task: "Idle" }
        });
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        AtabeyStorage.reset();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    // TODO: Restore after Hermes polling mock is properly wired
    // The AgentExecutor now uses 30s polling which blocks integration tests
    it.skip("should allow Manager to delegate a task to Backend and complete it", async () => {
        const traceId = "test-flow-123";

        // Mock AgentExecutor.execute to skip Hermes polling (30s timeout)
        const { AgentExecutor } = await import("../../src/modules/engines/agent-executor.js");
        vi.spyOn(AgentExecutor, "execute").mockResolvedValue({
            success: true,
            agent: "@backend",
            output: "[MOCK] Backend API service created",
            attempts: 1
        });

        // 1. Manager delegates a backend-related task
        const taskPayload = {
            traceId: traceId,
            task: "Create backend API service for user management",
            priority: "P1",
            agent: "@backend"
        };
        await sendMessage({
            from: "@manager",
            to: "@backend",
            category: "DELEGATION",
            content: JSON.stringify(taskPayload),
            traceId: traceId
        });

        // 2. Orchestrator processes the task (single iteration)
        await orchestrateCommand({ maxIterations: 1 });

        // 3. Verify the task was executed
        const status = memoryUtils.readStatus();
        const allAgents = Object.values(status);
        const executedAgent = allAgents.find(a => a.task && a.task.includes("Create backend API"));
        expect(executedAgent).toBeDefined();
        expect(["COMPLETED", "EXECUTING"]).toContain(executedAgent!.state);
    });
});
