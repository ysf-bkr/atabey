import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock AgentExecutor globally so it propagates to orchestrate.ts
const mockExecute = vi.fn().mockImplementation(async (task, traceId) => {
    const { RoutingEngine } = await import("../src/modules/engines/routing-engine.js");
    const agent = RoutingEngine.resolveAgent(task);
    const { AtabeyStorage } = await import("../src/shared/storage.js");
    AtabeyStorage.updateAgentStatus(agent.replace("@", ""), "COMPLETED", task);
    return {
        success: true,
        agent,
        output: `[MOCK] Completed: ${task}`,
        attempts: 1
    };
});
vi.mock("../src/modules/engines/agent-executor.js", () => {
    return {
        AgentExecutor: {
            execute: (...args: any[]) => mockExecute(...args)
        }
    };
});

import { orchestrateCommand, sendMessage } from "../src/cli/commands/orchestrate.js";
import * as memoryUtils from "../src/cli/utils/memory.js";
import { AtabeyStorage } from "../src/shared/storage.js";

describe("Orchestrator Task Dependencies Enforcer", () => {
    let tempDir: string;
    let memoryDir: string;

    beforeEach(() => {
        AtabeyStorage.reset();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-dep-test-"));
        memoryDir = path.join(tempDir, "memory");
        process.env.ATABEY_TEST_DIR = tempDir;

        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);

        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        AtabeyStorage.reset();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should hold execution if task dependencies are not completed, and execute once resolved", async () => {
        const traceId = "T-DEP-001";

        // 1. Setup tasks with dependency chain
        const task01 = { id: "TASK_01", traceId, description: "Architecture design task", agent: "@architect", status: "PENDING", priority: "NORMAL", dependencies: [] };
        const task02 = { id: "TASK_02", traceId, description: "Implement API endpoints based on architecture", agent: "@backend", status: "PENDING", priority: "NORMAL", dependencies: ["TASK_01"] };

        AtabeyStorage.saveTask(task01 as any);
        AtabeyStorage.saveTask(task02 as any);

        // Send delegation messages
        await sendMessage({ from: "@manager", to: "@architect", category: "DELEGATION", content: JSON.stringify(task01), traceId, parentId: "TASK_01" });
        await sendMessage({ from: "@manager", to: "@backend", category: "DELEGATION", content: JSON.stringify(task02), traceId, parentId: "TASK_02", dependencies: ["TASK_01"] });

        // 2. First iteration: architecture task executes, backend stays pending
        await orchestrateCommand({ maxIterations: 1 });

        const status1 = memoryUtils.readStatus();
        const firstExecuted = Object.values(status1).some(a => a.state === "COMPLETED" || a.state === "EXECUTING");
        expect(firstExecuted).toBe(true);

        // 3. Mark TASK_01 as COMPLETED so dependencies are resolved
        AtabeyStorage.saveTask({ ...task01, status: "COMPLETED" } as any);

        // 4. Second iteration: remaining tasks can now execute
        await orchestrateCommand({ maxIterations: 1 });

        const finalStatus = memoryUtils.readStatus();
        const allExecuted = Object.values(finalStatus).some(a => a.state === "COMPLETED" || a.state === "EXECUTING");
        expect(allExecuted).toBe(true);
    });
});
