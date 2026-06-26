import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as memoryUtils from "../../../src/cli/utils/memory.js";
import { AgentExecutor } from "../../../src/modules/engines/agent-executor.js";
import { RoutingEngine } from "../../../src/modules/engines/routing-engine.js";
import { AtabeyStorage } from "../../../src/shared/storage.js";

describe("AgentExecutor", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-executor-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(path.join(tempDir, "memory"));
        fs.mkdirSync(path.join(tempDir, "memory"), { recursive: true });
        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        AtabeyStorage.reset();
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should resolve to @frontend for UI tasks", () => {
        const result = RoutingEngine.resolveWithDetails("Create a React login component");
        expect(result.agent).toBe("@frontend");
        expect(result.confidence).toBeDefined();
    });

    it("should resolve to @backend for API tasks", () => {
        const result = RoutingEngine.resolveWithDetails("Implement API business logic");
        expect(result.agent).toBe("@backend");
        expect(result.confidence).toBeDefined();
    });

    it("should resolve to @database for DB tasks", () => {
        const result = RoutingEngine.resolveWithDetails("Create a database migration for users table");
        expect(result.agent).toBe("@database");
    });

    it("should generate subtasks for any agent", () => {
        const result = RoutingEngine.resolveWithDetails("Build a responsive UI with React");
        expect(result.subTasks.length).toBeGreaterThan(0);
        expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it("should execute task pipeline and log results to SQLite", async () => {
        // Mock runAgentTask to skip Hermes polling and return immediately
        vi.spyOn(AgentExecutor as any, "runAgentTask").mockResolvedValue("[MOCK] Task completed");

        const result = await AgentExecutor.execute("Setup database schema", "T-004");
        expect(result.success).toBe(true);
        expect(result.agent).toBeDefined();

        // Verify logs were written
        const logs = AtabeyStorage.getLogs();
        const executionLog = logs.find(l => l.action === "DELEGATION_SENT" || l.action === "COMPLETED");
        expect(executionLog).toBeDefined();
    });

    it("should route database tasks to @database via routing engine", () => {
        const result = RoutingEngine.resolveWithDetails("Create a database migration for users table");
        expect(result.agent).toBe("@database");
    });
});
