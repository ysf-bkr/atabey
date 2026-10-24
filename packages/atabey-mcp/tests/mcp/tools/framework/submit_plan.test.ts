import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSubmitPlan } from "../../../../src/mcp/tools/framework/submit_plan.js";
import { Storage } from "atabey-shared/storage.js";

/**
 * `submit_plan` used to shell out to `npx atabey plan:submit`, which is not a
 * command. The CLI routes unknown commands to @manager as natural language, so
 * the tool replied with a success-looking message while storing nothing —
 * `atabey plan list` stayed empty. These tests assert real persistence, which is
 * the only thing that makes the reply trustworthy.
 */
describe("submit_plan", () => {
    let dir: string;

    const call = (tasks: unknown) => handleSubmitPlan(dir, { tasks } as never);
    const text = (res: { content: Array<{ text: string }> }) => res.content[0].text;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-plan-"));
        process.env.ATABEY_TEST_DIR = dir;
        Storage.reset();
    });

    afterEach(() => {
        Storage.reset();
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const task = (over: Record<string, unknown> = {}) => ({
        id: "TASK-001",
        agent: "@backend",
        task: "implement endpoint",
        acceptanceCriteria: ["tests pass"],
        ...over,
    });

    it("persists the plan, its tasks and the delegations", () => {
        const res = call([task(), task({ id: "TASK-002", agent: "@frontend", dependencies: ["TASK-001"] })]);

        expect(res.isError).toBeUndefined();
        expect(text(res)).toContain("Plan accepted");
        expect(text(res)).toContain("2 task(s)");

        // The plan itself is stored under plan_<traceId>.
        const plans = Object.entries(Storage.getAllMetadata()).filter(([k]) => k.startsWith("plan_"));
        expect(plans).toHaveLength(1);

        const stored = JSON.parse(plans[0][1]) as { tasks: Array<{ id: string }> };
        expect(stored.tasks.map((t) => t.id)).toEqual(["TASK-001", "TASK-002"]);

        // Tasks land in the task table so `atabey plan list` can show them.
        const tasks = Storage.getTasks();
        expect(tasks.map((t) => t.id)).toEqual(expect.arrayContaining(["TASK-001", "TASK-002"]));

        // Each task is queued as a DELEGATION message for its agent.
        const pending = Storage.getPendingMessages();
        expect(pending.length).toBeGreaterThanOrEqual(2);
        // Storage normalises the @ prefix when it persists messages.
        expect(pending.map((m) => m.to)).toEqual(expect.arrayContaining(["backend", "frontend"]));
    });

    it("rejects a task without acceptance criteria", () => {
        const res = call([{ id: "TASK-001", agent: "@backend", task: "no criteria" }]);
        expect(res.isError).toBe(true);
        expect(text(res)).toMatch(/no acceptance criteria/i);
    });

    it("rejects an empty task list", () => {
        const res = call([]);
        expect(res.isError).toBe(true);
        expect(text(res)).toContain("'tasks' array is required");
    });

    it("rejects a malformed task id at the validation boundary", () => {
        // The Zod schema rejects bad ids before the handler runs; calling the
        // handler directly bypasses that, so assert the engine's own gate too.
        const res = call([task({ id: "nope" })]);
        expect(res.isError).toBe(true);
    });

    it("reports the dependency graph in its reply", () => {
        const res = call([task(), task({ id: "TASK-002", dependencies: ["TASK-001"] })]);
        const body = text(res);
        expect(body).toContain("after TASK-001");
        expect(body).toContain("no deps");
    });

    it("does not leave the database untouched on success (regression guard)", () => {
        const count = () => Object.keys(Storage.getAllMetadata()).filter((k) => k.startsWith("plan_")).length;
        expect(count()).toBe(0);
        call([task()]);
        expect(count()).toBe(1);
    });
});
