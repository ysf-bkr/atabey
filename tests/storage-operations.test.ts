import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Temporary framework directory for tests
const TEST_DIR = path.join(os.tmpdir(), "atabey-test-dashboard-" + Date.now());

beforeAll(async () => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    // Create test framework directory
    fs.mkdirSync(path.join(TEST_DIR, "memory"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "messages"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "logs"), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, "observability"), { recursive: true });

    // Test status.json
    fs.writeFileSync(
        path.join(TEST_DIR, "memory", "status.json"),
        JSON.stringify({
            "@manager": { state: "ACTIVE", task: "Orchestrating", lastUpdated: new Date().toISOString() },
            "@backend": { state: "READY", task: "Idle", lastUpdated: new Date().toISOString() },
        })
    );

    // Test audit log
    fs.writeFileSync(
        path.join(TEST_DIR, "observability", "audit_log.md"),
        "# Audit Log\n"
    );

    // Initialize storage
    const storageModule = await import("../src/shared/storage.js");
    const Storage = storageModule.Storage;
    Storage.setMetadata("phase", "PHASE_0");
    Storage.setMetadata("traceId", "T-001");
});

afterAll(async () => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    const storageModule = await import("../src/shared/storage.js");
    const Storage = storageModule.Storage;
    Storage.reset();
});

describe("Dashboard API - Storage Operations", () => {
    it("should store and retrieve agents", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        Storage.updateAgentStatus("@manager", "ACTIVE", "Testing");
        Storage.updateAgentStatus("@backend", "READY", "Idle");

        const agents = Storage.getAllAgents();
        expect(agents.length).toBeGreaterThanOrEqual(2);
        const manager = agents.find((a) => a.name === "manager");
        expect(manager).toBeDefined();
        expect(manager?.state).toBe("ACTIVE");
    });

    it("should store and retrieve messages", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        Storage.saveMessage({
            timestamp: new Date().toISOString(),
            from: "@manager" as any,
            to: "@backend" as any,
            category: "DELEGATION",
            content: "Test task",
            traceId: "T-001" as any,
            status: "PENDING",
            priority: "NORMAL",
            requiresApproval: false,
        });

        const messages = Storage.getPendingMessages();
        expect(messages.length).toBeGreaterThanOrEqual(1);
        expect(messages[0].category).toBe("DELEGATION");
    });

    it("should store and retrieve tasks", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        Storage.saveTask({
            id: "TASK-001" as any,
            traceId: "T-001" as any,
            description: "Test task",
            agent: "@backend" as any,
            status: "PENDING",
            priority: "NORMAL",
            dependencies: [],
        });

        const tasks = Storage.getTasks("T-001" as any);
        expect(tasks.length).toBeGreaterThanOrEqual(1);
        expect(tasks[0].id).toBe("TASK-001");
    });

    it("should store and retrieve logs with cryptographic hashing", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        Storage.saveLog({
            agent: "@manager",
            action: "TEST_CHAIN",
            trace_id: "T-001",
            status: "SUCCESS",
            summary: "Test log entry for cryptographic chaining",
        });

        const logs = Storage.getLogs();
        const testLog = logs.find((l) => l.action === "TEST_CHAIN");
        expect(testLog).toBeDefined();
        expect(testLog?.status).toBe("SUCCESS");
        expect(testLog?.prev_hash).toBeDefined();
        expect(testLog?.hash).toBeDefined();

        const integrity = Storage.verifyLogIntegrity();
        expect(integrity.valid).toBe(true);
    });

    it("should fail integrity check if log database is tampered with", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        Storage.saveLog({
            agent: "@manager",
            action: "SECURE_LOG",
            trace_id: "T-001",
            status: "SUCCESS",
            summary: "Secure log",
        });

        const integrityBefore = Storage.verifyLogIntegrity();
        expect(integrityBefore.valid).toBe(true);

        // Manually tamper the database row
        const db = Storage.getDB();
        db.prepare("UPDATE logs SET summary = 'Tampered log content' WHERE action = 'SECURE_LOG'").run();

        const integrityAfter = Storage.verifyLogIntegrity();
        expect(integrityAfter.valid).toBe(false);
        expect(integrityAfter.reason).toContain("Hash corruption");
    });

    it("should approve pending messages", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        // Add a message that requires approval
        Storage.saveMessage({
            timestamp: new Date().toISOString(),
            from: "@backend" as any,
            to: "@manager" as any,
            category: "ALERT",
            content: "Requires approval",
            traceId: "T-002" as any,
            status: "PENDING",
            priority: "HIGH",
            requiresApproval: true,
        });

        // Approve
        const db = Storage.getDB();
        const pending = db.prepare(
            "SELECT id FROM messages WHERE trace_id = ? AND status = 'PENDING'"
        ).all("T-002") as Array<{ id: number }>;

        expect(pending.length).toBe(1);
        Storage.updateMessageStatus(pending[0].id, "APPROVED");

        const approved = db.prepare(
            "SELECT status FROM messages WHERE trace_id = ?"
        ).get("T-002") as { status: string };
        expect(approved.status).toBe("APPROVED");
    });
});

describe("Dashboard API - Metadata", () => {
    it("should store and retrieve metadata", async () => {
        const { Storage } = await import("../src/shared/storage.js");
        Storage.setMetadata("test-key", "test-value");
        const value = Storage.getMetadata("test-key");
        expect(value).toBe("test-value");
    });
});
