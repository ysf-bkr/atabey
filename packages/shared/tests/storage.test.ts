import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AtabeyStorage, resolveFrameworkDir } from "../src/modules/storage/storage.js";
import { asAgentID, asTraceID } from "../src/modules/primitives/types.js";
import type { MessageRow, TaskRow } from "../src/modules/storage/storage.js";

/**
 * Unit tests for AtabeyStorage — the canonical SQLite storage engine.
 * Each test runs against a fresh temporary framework directory via
 * ATABEY_TEST_DIR so no state leaks between tests or into the repo.
 */
describe("AtabeyStorage (canonical SQLite storage engine)", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-storage-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        AtabeyStorage.reset();
    });

    afterEach(() => {
        AtabeyStorage.reset();
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe("resolveFrameworkDir", () => {
        it("resolves the framework dir from ATABEY_TEST_DIR", () => {
            expect(resolveFrameworkDir()).toBe(tempDir);
        });

        it("creates the SQLite database file inside the framework dir on first access", () => {
            AtabeyStorage.getDB();
            const dbPath = path.join(tempDir, "atabey.db");
            expect(fs.existsSync(dbPath)).toBe(true);
        });
    });

    describe("knowledge file persistence", () => {
        it("saves and retrieves a knowledge file", () => {
            AtabeyStorage.saveKnowledgeFile("security-standards.md", "# Security Rules\nNever commit secrets.");
            const file = AtabeyStorage.getKnowledgeFile("security-standards.md");
            expect(file).not.toBeNull();
            expect(file!.filename).toBe("security-standards.md");
            expect(file!.content).toContain("Never commit secrets.");
        });

        it("upserts on conflict and lists files newest first", () => {
            AtabeyStorage.saveKnowledgeFile("a.md", "v1");
            AtabeyStorage.saveKnowledgeFile("b.md", "v1");
            AtabeyStorage.saveKnowledgeFile("a.md", "v2");
            expect(AtabeyStorage.getKnowledgeFile("a.md")!.content).toBe("v2");

            const list = AtabeyStorage.getKnowledgeList();
            expect(list.length).toBe(2);
            expect(list.map(f => f.filename)).toContain("a.md");
            expect(list.map(f => f.filename)).toContain("b.md");
        });

        it("returns null for a missing knowledge file", () => {
            expect(AtabeyStorage.getKnowledgeFile("missing.md")).toBeNull();
        });

        it("deletes a knowledge file and reports whether it existed", () => {
            AtabeyStorage.saveKnowledgeFile("c.md", "content");
            expect(AtabeyStorage.deleteKnowledgeFile("c.md")).toBe(true);
            expect(AtabeyStorage.deleteKnowledgeFile("c.md")).toBe(false);
            expect(AtabeyStorage.getKnowledgeFile("c.md")).toBeNull();
        });
    });

    describe("agent persistence", () => {
        it("creates an agent in READY state and lists it", () => {
            AtabeyStorage.createAgent("backend", "API specialist", "node,vitest");
            const agents = AtabeyStorage.getAllAgents();
            expect(agents.length).toBe(1);
            expect(agents[0].name).toBe("backend");
            expect(agents[0].state).toBe("READY");
            expect(agents[0].task).toBe("Idle");
        });

        it("normalizes the @ prefix on create and update", () => {
            AtabeyStorage.createAgent("@quality", "QA", "lint");
            expect(AtabeyStorage.getAllAgents()[0].name).toBe("quality");

            AtabeyStorage.updateAgentStatus("quality", "EXECUTING", "Run lint");
            const updated = AtabeyStorage.getAllAgents().find(a => a.name === "quality");
            expect(updated!.state).toBe("EXECUTING");
            expect(updated!.task).toBe("Run lint");
        });

        it("updateAgentStatus upserts an agent that does not exist yet", () => {
            AtabeyStorage.updateAgentStatus("frontend", "READY", "Idle");
            const agents = AtabeyStorage.getAllAgents();
            expect(agents.length).toBe(1);
            expect(agents[0].name).toBe("frontend");
        });

        it("updateAgentDetails round-trips all fields", () => {
            AtabeyStorage.updateAgentDetails("devops", "CI/CD specialist", "BUSY", "Set up pipeline", "docker,gha");
            const agent = AtabeyStorage.getAllAgents().find(a => a.name === "devops");
            expect(agent!.state).toBe("BUSY");
            expect(agent!.task).toBe("Set up pipeline");
        });

        it("deletes an agent and reports whether it existed", () => {
            AtabeyStorage.createAgent("git", "VCS specialist", "git");
            expect(AtabeyStorage.deleteAgent("git")).toBe(true);
            expect(AtabeyStorage.deleteAgent("git")).toBe(false);
            expect(AtabeyStorage.getAllAgents()).toHaveLength(0);
        });
    });

    describe("message persistence (Hermes queue)", () => {
        const makeMessage = (overrides: Partial<MessageRow> = {}): MessageRow => ({
            timestamp: new Date().toISOString(),
            from: asAgentID("@manager"),
            to: asAgentID("@backend"),
            category: "DELEGATION",
            content: "Implement the login endpoint",
            traceId: asTraceID("T-001"),
            status: "PENDING",
            priority: "HIGH",
            requiresApproval: false,
            ...overrides,
        });

        it("saves a message and returns it as pending", () => {
            AtabeyStorage.saveMessage(makeMessage());
            const pending = AtabeyStorage.getPendingMessages();
            expect(pending.length).toBe(1);
            expect(pending[0].from).toBe("manager");
            expect(pending[0].to).toBe("backend");
            expect(pending[0].category).toBe("DELEGATION");
            expect(pending[0].status).toBe("PENDING");
        });

        it("updateMessageStatus removes a message from the pending set", () => {
            AtabeyStorage.saveMessage(makeMessage());
            const [msg] = AtabeyStorage.getPendingMessages();
            expect(msg.id).toBeDefined();
            AtabeyStorage.updateMessageStatus(msg.id as number, "PROCESSED");
            expect(AtabeyStorage.getPendingMessages()).toHaveLength(0);
        });

        it("fires the onMessageSaved hook with traceId and category", () => {
            let hookPayload: { traceId: string; category: string } | null = null;
            AtabeyStorage.onMessageSaved = (m) => { hookPayload = m; };
            try {
                AtabeyStorage.saveMessage(makeMessage());
                expect(hookPayload).toEqual({ traceId: "T-001", category: "DELEGATION" });
            } finally {
                AtabeyStorage.onMessageSaved = null;
            }
        });

        it("fires the onMessageStatusUpdated hook on status change", () => {
            let hookArgs: [number, string] | null = null;
            AtabeyStorage.onMessageStatusUpdated = (id, status) => { hookArgs = [id, status]; };
            try {
                AtabeyStorage.saveMessage(makeMessage());
                const [msg] = AtabeyStorage.getPendingMessages();
                AtabeyStorage.updateMessageStatus(msg.id as number, "DONE");
                expect(hookArgs).toEqual([msg.id as number, "DONE"]);
            } finally {
                AtabeyStorage.onMessageStatusUpdated = null;
            }
        });

        it("masks PII in message content before persisting", () => {
            AtabeyStorage.saveMessage(makeMessage({ content: "Contact john.doe@example.com for details" }));
            const [msg] = AtabeyStorage.getPendingMessages();
            expect(msg.content).not.toContain("john.doe@example.com");
        });
    });

    describe("task persistence", () => {
        const makeTask = (overrides: Partial<TaskRow> = {}): TaskRow => ({
            id: "TASK-001" as TaskRow["id"],
            traceId: asTraceID("T-001"),
            description: "Implement rate limiter",
            agent: asAgentID("@backend"),
            status: "PENDING",
            priority: "P1",
            dependencies: [],
            ...overrides,
        });

        it("saves a task and retrieves it by trace id", () => {
            AtabeyStorage.saveTask(makeTask());
            const tasks = AtabeyStorage.getTasks(asTraceID("T-001"));
            expect(tasks.length).toBe(1);
            expect(tasks[0].id).toBe("TASK-001");
            expect(tasks[0].agent).toBe("@backend");
            expect(tasks[0].dependencies).toEqual([]);
        });

        it("filters tasks by trace id", () => {
            AtabeyStorage.saveTask(makeTask());
            AtabeyStorage.saveTask(makeTask({ id: "TASK-002" as TaskRow["id"], traceId: asTraceID("T-002") }));
            expect(AtabeyStorage.getTasks(asTraceID("T-001"))).toHaveLength(1);
            expect(AtabeyStorage.getTasks(asTraceID("T-002"))).toHaveLength(1);
        });

        it("upserts a task on id conflict (status/priority update)", () => {
            AtabeyStorage.saveTask(makeTask({ status: "PENDING", priority: "P2" }));
            AtabeyStorage.saveTask(makeTask({ status: "COMPLETED", priority: "P1" }));
            const tasks = AtabeyStorage.getTasks(asTraceID("T-001"));
            expect(tasks).toHaveLength(1);
            expect(tasks[0].status).toBe("COMPLETED");
            expect(tasks[0].priority).toBe("P1");
        });

        it("round-trips task dependencies", () => {
            AtabeyStorage.saveTask(makeTask({
                id: "TASK-003" as TaskRow["id"],
                dependencies: ["TASK-001" as TaskRow["id"], "TASK-002" as TaskRow["id"]],
            }));
            const [task] = AtabeyStorage.getTasks(asTraceID("T-001")).filter(t => t.id === "TASK-003");
            expect(task.dependencies).toEqual(["TASK-001", "TASK-002"]);
        });
    });

    describe("audit log persistence (hash chain)", () => {
        it("saves a log row and returns its id", () => {
            const id = AtabeyStorage.saveLog({
                agent: "@backend",
                action: "TASK_COMPLETED",
                status: "SUCCESS",
                summary: "Implemented the login endpoint",
            });
            expect(id).toBeGreaterThan(0);
        });

        it("chains log rows via prev_hash and keeps the chain verifiable", () => {
            AtabeyStorage.saveLog({ agent: "@backend", action: "A1", status: "SUCCESS", summary: "first" });
            AtabeyStorage.saveLog({ agent: "@quality", action: "A2", status: "SUCCESS", summary: "second" });

            // getLogs returns newest-first (timestamp DESC, id DESC tie-break).
            const logs = AtabeyStorage.getLogs();
            expect(logs.length).toBe(2);
            expect(logs[0].action).toBe("A2");
            expect(logs[0].prev_hash).toBe(logs[1].hash);
            expect(logs[1].prev_hash).toBe("GENESIS");

            const integrity = AtabeyStorage.verifyLogIntegrity();
            expect(integrity.valid).toBe(true);
            expect(integrity.checked).toBe(2);
        });

        it("masks PII in log summaries before persisting", () => {
            AtabeyStorage.saveLog({
                agent: "@backend",
                action: "CONTACT",
                status: "SUCCESS",
                summary: "User email: jane@example.com",
            });
            const [log] = AtabeyStorage.getLogs();
            expect(log.summary).not.toContain("jane@example.com");
        });

        it("filters logs by agent name", () => {
            AtabeyStorage.saveLog({ agent: "@backend", action: "A", status: "SUCCESS", summary: "s" });
            AtabeyStorage.saveLog({ agent: "@quality", action: "B", status: "SUCCESS", summary: "s" });
            expect(AtabeyStorage.getLogs("backend")).toHaveLength(1);
            expect(AtabeyStorage.getLogs("quality")[0].action).toBe("B");
        });
    });

    describe("metadata", () => {
        it("sets and gets a metadata key", () => {
            AtabeyStorage.setMetadata("project.phase", "PHASE_1");
            expect(AtabeyStorage.getMetadata("project.phase")).toBe("PHASE_1");
        });

        it("overwrites an existing metadata key", () => {
            AtabeyStorage.setMetadata("k", "v1");
            AtabeyStorage.setMetadata("k", "v2");
            expect(AtabeyStorage.getMetadata("k")).toBe("v2");
        });

        it("returns null for a missing metadata key", () => {
            expect(AtabeyStorage.getMetadata("missing")).toBeNull();
        });
    });

    describe("loop cooldown persistence", () => {
        it("saves and retrieves a cooldown for an agent", () => {
            const until = Date.now() + 30_000;
            AtabeyStorage.saveLoopCooldown("@backend", until, "file churn detected", 2);
            const cd = AtabeyStorage.getLoopCooldown("backend");
            expect(cd).not.toBeNull();
            expect(cd!.cooldownUntil).toBe(until);
            expect(cd!.detail).toBe("file churn detected");
            expect(cd!.cooldownCount).toBe(2);
        });

        it("returns null when no cooldown exists", () => {
            expect(AtabeyStorage.getLoopCooldown("frontend")).toBeNull();
        });

        it("clears a specific cooldown and reports whether it existed", () => {
            AtabeyStorage.saveLoopCooldown("@backend", Date.now() + 1000, null);
            expect(AtabeyStorage.clearLoopCooldown("backend")).toBe(true);
            expect(AtabeyStorage.clearLoopCooldown("backend")).toBe(false);
        });

        it("purges only expired cooldowns", () => {
            AtabeyStorage.saveLoopCooldown("@backend", Date.now() - 1000, "expired");
            AtabeyStorage.saveLoopCooldown("@frontend", Date.now() + 60_000, "active");
            const purged = AtabeyStorage.purgeExpiredLoopCooldowns();
            expect(purged).toBe(1);
            expect(AtabeyStorage.getLoopCooldown("frontend")).not.toBeNull();
            expect(AtabeyStorage.getLoopCooldown("backend")).toBeNull();
        });
    });

    describe("discipline persistence", () => {
        it("saves and retrieves discipline stats for an agent", () => {
            AtabeyStorage.saveDiscipline("@backend", {
                totalCalls: 12,
                violations: 2,
                lastViolation: "rate limit exceeded",
                cooldownUntil: Date.now() + 5000,
            });
            const d = AtabeyStorage.getDiscipline("backend");
            expect(d).not.toBeNull();
            expect(d!.totalCalls).toBe(12);
            expect(d!.violations).toBe(2);
            expect(d!.lastViolation).toBe("rate limit exceeded");
        });

        it("records discipline calls and returns recent history since a timestamp", () => {
            const now = Date.now();
            AtabeyStorage.recordDisciplineCall("backend", "write_file", now - 1000, 120);
            AtabeyStorage.recordDisciplineCall("backend", "read_file", now, 80);
            const recent = AtabeyStorage.getRecentDisciplineCalls("backend", now - 500);
            expect(recent.length).toBe(1);
            expect(recent[0].tool).toBe("read_file");
            expect(recent[0].argsSize).toBe(80);
        });

        it("prunes discipline calls before a timestamp", () => {
            const now = Date.now();
            AtabeyStorage.recordDisciplineCall("backend", "write_file", now - 10_000, 100);
            AtabeyStorage.recordDisciplineCall("backend", "read_file", now, 100);
            AtabeyStorage.pruneDisciplineCalls(now - 5000);
            expect(AtabeyStorage.getRecentDisciplineCalls("backend", 0)).toHaveLength(1);
        });

        it("clears all discipline state", () => {
            AtabeyStorage.saveDiscipline("@backend", { totalCalls: 1, violations: 0, lastViolation: null, cooldownUntil: 0 });
            AtabeyStorage.clearAllDiscipline();
            expect(AtabeyStorage.getDiscipline("backend")).toBeNull();
        });
    });

    describe("user persistence", () => {
        it("creates users, resolves by token, and reports existence", () => {
            expect(AtabeyStorage.hasUsers()).toBe(false);
            AtabeyStorage.createUser("alice", "tok-1", "admin");
            expect(AtabeyStorage.hasUsers()).toBe(true);

            const user = AtabeyStorage.getUserByToken("tok-1");
            expect(user).toEqual({ name: "alice", role: "admin" });
            expect(AtabeyStorage.getUserByToken("wrong")).toBeNull();
        });

        it("deletes a user and reports whether it existed", () => {
            AtabeyStorage.createUser("bob", "tok-2", "dev");
            expect(AtabeyStorage.deleteUser("bob")).toBe(true);
            expect(AtabeyStorage.deleteUser("bob")).toBe(false);
        });
    });

    describe("database integrity", () => {
        it("passes the built-in integrity check on a healthy database", () => {
            AtabeyStorage.saveLog({ agent: "@backend", action: "BOOT", status: "SUCCESS", summary: "db ready" });
            const result = AtabeyStorage.checkIntegrity();
            expect(result.ok).toBe(true);
        });
    });
});
