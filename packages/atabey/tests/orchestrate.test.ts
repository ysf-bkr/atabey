import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as memoryUtils from "../src/cli/utils/memory.js";
import { HermesMessageSchema, sendMessage, orchestrateCommand } from "../src/cli/commands/orchestrate.js";
import { Storage } from "../src/shared/storage.js";

describe("Hermes Message Protocol & Orchestration", () => {
    let tempDir: string;
    let memoryDir: string;
    let messagesDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-orchestrate-test-"));
        memoryDir = path.join(tempDir, "memory");
        messagesDir = path.join(tempDir, "messages");
        process.env.ATABEY_TEST_DIR = tempDir;
        
        // Mock the path resolution functions
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);
        
        fs.mkdirSync(memoryDir, { recursive: true });
        fs.mkdirSync(messagesDir, { recursive: true });
        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should validate valid Hermes messages", () => {
        const validMsg = {
            timestamp: new Date().toISOString(),
            from: "@manager",
            to: "@backend",
            category: "DELEGATION",
            content: "Please generate Fastify types.",
            traceId: "test-trace-id",
            status: "PENDING",
            priority: "HIGH"
        };

        const result = HermesMessageSchema.safeParse(validMsg);
        expect(result.success).toBe(true);
    });

    it("should write messages to Storage", async () => {
        const messageArgs = {
            from: "@manager",
            to: "@backend",
            category: "DELEGATION" as const,
            content: "Create backend structures",
            traceId: "trace-1"
        };

        const result = await sendMessage(messageArgs);
        expect(result).toBeDefined();
        
        const pending = Storage.getPendingMessages();
        expect(pending.length).toBe(1);
    });

    it("should detect executing agent timeouts and transition them to READY (Self-Healing)", async () => {
        const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const initialStatus = {
            "@manager": { state: "READY", task: "Idle" },
            "@frontend": { state: "EXECUTING", task: "Compiling assets", lastUpdated: pastTime }
        };
        memoryUtils.updateDocumentStore("status", initialStatus);

        // Run a single orchestration iteration
        await orchestrateCommand({ maxIterations: 1 });

        const statuses = memoryUtils.readStatus();
        expect(statuses["@frontend"]).toBeDefined();
        expect(statuses["@frontend"].state).toBe("READY");
    });
});
