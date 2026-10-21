import { describe, expect, it } from "vitest";
import { AgentDispatcher } from "../../src/modules/runtime/dispatcher.js";
import type { AgentTurnReport } from "../../src/modules/runtime/agent-runtime.js";
import type { Plan, PlanTask } from "../../src/modules/engines/types.js";
import { asPlanID, asTaskID } from "../../src/shared/types.js";

function task(id: string, agent: string, text: string, deps: string[] = []): PlanTask {
    return { id: asTaskID(id), agent, task: text, dependencies: deps.map((d) => asTaskID(d)) };
}

function makePlan(planId: string, tasks: PlanTask[]): Plan {
    return { planId: asPlanID(planId), tasks };
}

function report(agent: string, output: string, inputTokens = 5, outputTokens = 5): AgentTurnReport {
    return {
        ok: true,
        output,
        exitCode: 0,
        durationMs: 10,
        timedOut: false,
        adapterId: "fake",
        agent,
        inputTokens,
        outputTokens,
        isolation: "main-tree",
        sandbox: "off",
    };
}

function failure(agent: string, error: string, inputTokens = 5, outputTokens = 5): AgentTurnReport {
    return {
        ...report(agent, "", inputTokens, outputTokens),
        ok: false,
        error,
    };
}

describe("AgentDispatcher Resilience & Fallback (Integration)", () => {
    it("handles uncaught worker crashes without aborting the dispatch wave", async () => {
        const plan = makePlan("P-CRASH", [
            task("T1", "@backend", "Task that crashes"),
            task("T2", "@frontend", "Task that succeeds"),
        ]);

        const report_ = await AgentDispatcher.dispatch(plan, {
            worktree: false,
            collectEvidence: false,
            runner: async (agent) => {
                if (agent === "@backend") {
                    throw new Error("Worker process timed out after 30000ms");
                }
                return report(agent, "Frontend component rendered", 10, 15);
            },
        });

        expect(report_.ok).toBe(false);
        expect(report_.results).toHaveLength(2);

        const t1 = report_.results.find((r) => r.id === "T1");
        const t2 = report_.results.find((r) => r.id === "T2");

        expect(t1?.ok).toBe(false);
        expect(t1?.error).toContain("Worker process timed out");
        expect(t2?.ok).toBe(true);
        expect(t2?.output).toBe("Frontend component rendered");
    });

    it("retries failed tasks according to maxRetries option", async () => {
        const plan = makePlan("P-RETRY", [
            task("T1", "@backend", "Flaky network call"),
        ]);

        let attempts = 0;
        const report_ = await AgentDispatcher.dispatch(plan, {
            worktree: false,
            collectEvidence: false,
            maxRetries: 2,
            runner: async (agent) => {
                attempts++;
                if (attempts < 3) {
                    return failure(agent, `Attempt ${attempts} failed`);
                }
                return report(agent, "Success on attempt 3");
            },
        });

        expect(attempts).toBe(3);
        expect(report_.ok).toBe(true);
        const t1 = report_.results.find((r) => r.id === "T1");
        expect(t1?.ok).toBe(true);
        expect(t1?.output).toBe("Success on attempt 3");
    });

    it("delegates to fallbackAgent when primary agent fails and retries are exhausted", async () => {
        const plan = makePlan("P-FALLBACK", [
            task("T1", "@backend", "Complex task needing fallback"),
        ]);

        const invokedAgents: string[] = [];

        const report_ = await AgentDispatcher.dispatch(plan, {
            worktree: false,
            collectEvidence: false,
            maxRetries: 1,
            fallbackAgent: {
                "@backend": "@manager",
            },
            runner: async (agent) => {
                invokedAgents.push(agent);
                if (agent === "@backend") {
                    throw new Error("Backend agent failed execution");
                }
                return report(agent, "Fallback manager resolved the issue", 20, 30);
            },
        });

        // 2 attempts for @backend (initial + 1 retry), then 1 attempt for fallback @manager
        expect(invokedAgents).toEqual(["@backend", "@backend", "@manager"]);
        expect(report_.ok).toBe(true);
        const t1 = report_.results.find((r) => r.id === "T1");
        expect(t1?.agent).toBe("@manager");
        expect(t1?.ok).toBe(true);
        expect(t1?.output).toBe("Fallback manager resolved the issue");
    });

    it("skips downstream dependencies cleanly when upstream task and fallback both fail", async () => {
        const plan = makePlan("P-CASCADE", [
            task("T1", "@backend", "Root task fails"),
            task("T2", "@quality", "Dependent audit", ["T1"]),
        ]);

        const report_ = await AgentDispatcher.dispatch(plan, {
            worktree: false,
            collectEvidence: false,
            runner: async (agent) => {
                if (agent === "@backend") {
                    return failure(agent, "Unrecoverable database failure");
                }
                return report(agent, "Should not execute", 0, 0);
            },
        });

        expect(report_.ok).toBe(false);
        const t1 = report_.results.find((r) => r.id === "T1");
        const t2 = report_.results.find((r) => r.id === "T2");

        expect(t1?.ok).toBe(false);
        expect(t1?.skipped).toBe(false);
        expect(t2?.skipped).toBe(true);
        expect(t2?.error).toContain("dependency failed");
    });
});
