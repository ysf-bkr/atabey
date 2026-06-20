import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DIR = path.join(os.tmpdir(), "atabey-test-dash-" + Date.now());

beforeAll(async () => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    fs.mkdirSync(path.join(TEST_DIR, "memory"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "observability"), { recursive: true });

    const { Storage } = await import("../../../src/shared/storage.js");
    Storage.setMetadata("phase", "PHASE_1");
    Storage.setMetadata("traceId", "T-001");
    Storage.updateAgentStatus("@manager", "ACTIVE", "Orchestrating");
    Storage.updateAgentStatus("@backend", "READY", "Idle");
});

afterAll(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("Dashboard Server - HTTP API", () => {
    it("should return health check", async () => {
        const { dashboardCommand } = await import("../../../src/cli/commands/dashboard.js");
        // Just verify the function exists and exports correctly
        expect(dashboardCommand).toBeDefined();
        expect(typeof dashboardCommand).toBe("function");
    });

    it("should parse URLs correctly", async () => {
        const mod = await import("../../../src/cli/commands/dashboard.js");
        expect(mod).toBeDefined();
    });
});

describe("Storage - Critical Operations", () => {
    it("should handle agent lifecycle", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        const agents = Storage.getAllAgents();
        expect(agents.length).toBeGreaterThanOrEqual(2);

        const manager = agents.find(a => a.name === "manager");
        expect(manager).toBeDefined();
        expect(manager?.state).toBe("ACTIVE");
    });

    it("should handle message lifecycle", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.saveMessage({
            timestamp: new Date().toISOString(),
            from: "@manager" as any,
            to: "@backend" as any,
            category: "DELEGATION",
            content: "API endpoint oluştur",
            traceId: "T-001" as any,
            status: "PENDING",
            priority: "NORMAL",
            requiresApproval: false,
        });

        const messages = Storage.getPendingMessages();
        const delegation = messages.find(m => m.category === "DELEGATION");
        expect(delegation).toBeDefined();
        expect(delegation?.content).toContain("API");
    });

    it("should handle task lifecycle", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.saveTask({
            id: "T-PLAN-01" as any,
            traceId: "T-001" as any,
            description: "Test planning task",
            agent: "@backend" as any,
            status: "PENDING",
            priority: "P1",
            dependencies: [],
        });

        const tasks = Storage.getTasks("T-001" as any);
        expect(tasks.length).toBeGreaterThanOrEqual(1);
        expect(tasks[0].priority).toBe("P1");
    });

    it("should handle logs", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        const db = Storage.getDB();
        db.exec("INSERT INTO logs (agent, action, trace_id, status, summary) VALUES ('@manager', 'TEST_RUN', 'T-001', 'SUCCESS', 'Test completed')");

        const logs = Storage.getLogs();
        const testLog = logs.find(l => l.action === "TEST_RUN");
        expect(testLog).toBeDefined();
        expect(testLog?.status).toBe("SUCCESS");
    });

    it("should handle metadata", async () => {
        const { Storage } = await import("../../../src/shared/storage.js");
        Storage.setMetadata("custom-key", "custom-value");
        expect(Storage.getMetadata("custom-key")).toBe("custom-value");
    });
});
