import { describe, expect, it } from "vitest";
import { AgentDispatcher, computeWaves } from "../../../src/modules/runtime/dispatcher.js";
import { verifyEvidenceBundle } from "../../../src/modules/runtime/evidence.js";
import type { AgentTurnReport, RunTurnOptions } from "../../../src/modules/runtime/agent-runtime.js";
import type { Plan, PlanTask } from "../../../src/modules/engines/types.js";
import { asPlanID, asTaskID } from "../../../src/shared/types.js";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Runner = (agent: string, task: string, opts: RunTurnOptions) => Promise<AgentTurnReport>;

function task(id: string, agent: string, text: string, deps: string[] = []): PlanTask {
    return { id: asTaskID(id), agent, task: text, dependencies: deps.map((d) => asTaskID(d)) };
}

function makePlan(tasks: PlanTask[]): Plan {
    return { planId: asPlanID("PLAN_TEST"), tasks };
}

function report(agent: string, taskText: string, over: Partial<AgentTurnReport> = {}): AgentTurnReport {
    return {
        ok: true,
        output: `done:${taskText}`,
        exitCode: 0,
        durationMs: 1,
        timedOut: false,
        adapterId: "fake",
        agent,
        inputTokens: 5,
        outputTokens: 5,
        isolation: "main-tree",
        sandbox: "off",
        ...over,
    };
}

describe("computeWaves", () => {
    it("groups independent tasks and orders dependents", () => {
        const { waves, errors } = computeWaves([
            task("A", "@backend", "a"),
            task("B", "@quality", "b", ["A"]),
            task("C", "@frontend", "c"),
        ]);
        expect(errors).toEqual([]);
        expect(waves.map((w) => w.map((t) => t.id))).toEqual([
            ["A", "C"],
            ["B"],
        ]);
    });

    it("detects cyclic dependencies", () => {
        const { errors } = computeWaves([
            task("A", "@backend", "a", ["B"]),
            task("B", "@backend", "b", ["A"]),
        ]);
        expect(errors.length).toBeGreaterThan(0);
    });
});

describe("AgentDispatcher", () => {
    it("runs independent agents in parallel", async () => {
        let inflight = 0;
        let max = 0;
        const runner: Runner = async (agent, t) => {
            inflight++;
            max = Math.max(max, inflight);
            await sleep(20);
            inflight--;
            return report(agent, t);
        };

        const res = await AgentDispatcher.dispatch(
            makePlan([
                task("A", "@backend", "a"),
                task("B", "@quality", "b"),
                task("C", "@frontend", "c"),
            ]),
            { runner, maxConcurrency: 3, projectRoot: process.cwd() },
        );

        expect(res.ok).toBe(true);
        expect(res.results).toHaveLength(3);
        expect(max).toBeGreaterThanOrEqual(2);
        expect(res.waves).toEqual([["A", "B", "C"]]);
    });

    it("serializes tasks of the same agent (shared worktree safety)", async () => {
        const order: string[] = [];
        const runner: Runner = async (agent, t) => {
            order.push(`start:${t}`);
            await sleep(15);
            order.push(`end:${t}`);
            return report(agent, t);
        };

        await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "one"), task("B", "@backend", "two")]),
            { runner, maxConcurrency: 2, projectRoot: process.cwd() },
        );

        expect(order.indexOf("end:one")).toBeLessThan(order.indexOf("start:two"));
    });

    it("waits for dependencies before running dependents", async () => {
        const order: string[] = [];
        const runner: Runner = async (agent, t) => {
            order.push(t);
            return report(agent, t);
        };

        await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "first"), task("B", "@quality", "second", ["A"])]),
            { runner, projectRoot: process.cwd() },
        );

        expect(order).toEqual(["first", "second"]);
    });

    it("skips dependents when a dependency fails", async () => {
        const runner: Runner = async (agent, t) =>
            t === "boom" ? report(agent, t, { ok: false, error: "boom" }) : report(agent, t);

        const res = await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "boom"), task("B", "@quality", "after", ["A"])]),
            { runner, projectRoot: process.cwd() },
        );

        const b = res.results.find((r) => r.id === "B");
        expect(b?.skipped).toBe(true);
        expect(b?.error).toContain("dependency failed");
        expect(res.ok).toBe(false);
    });

    it("stops a same-agent task once its token budget is exhausted", async () => {
        const runner: Runner = async (agent, t) => report(agent, t, { inputTokens: 100, outputTokens: 100 });

        const res = await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "one"), task("B", "@backend", "two", ["A"])]),
            { runner, perAgentTokenBudget: 150, projectRoot: process.cwd() },
        );

        const b = res.results.find((r) => r.id === "B");
        expect(b?.skipped).toBe(true);
        expect(b?.error).toContain("budget");
    });

    it("aggregates total tokens across agents", async () => {
        const runner: Runner = async (agent, t) => report(agent, t, { inputTokens: 10, outputTokens: 20 });

        const res = await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "a"), task("B", "@quality", "b")]),
            { runner, projectRoot: process.cwd() },
        );

        expect(res.totalTokens).toBe(60);
    });

    it("rejects a plan with circular dependencies", async () => {
        const res = await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "a", ["B"]), task("B", "@backend", "b", ["A"])]),
            { runner: async (agent, t) => report(agent, t), projectRoot: process.cwd() },
        );

        expect(res.ok).toBe(false);
        expect(res.errors.length).toBeGreaterThan(0);
    });

    it("produces signed evidence bundles and a collision report", async () => {
        const runner: Runner = async (agent, t) => report(agent, t);
        const res = await AgentDispatcher.dispatch(
            makePlan([task("A", "@backend", "a"), task("B", "@quality", "b")]),
            { runner, projectRoot: process.cwd() },
        );

        expect(res.evidence).toHaveLength(2);
        expect(res.conflicts).toEqual([]);
        expect(verifyEvidenceBundle(res.evidence[0])).toBe(true);
    });
});
