import { describe, expect, it } from "vitest";
import { PlanningEngine } from "../../src/modules/engines/planning-engine.js";
import type { PlanID, TaskID } from "../../src/shared/types.js";

describe("PlanningEngine", () => {
    describe("createPlan", () => {
        it("should create a plan with valid structure", () => {
            const plan = PlanningEngine.createPlan([
                { task: "Create login API", agent: "@backend" },
                { task: "Create login page", agent: "@frontend" },
            ]);
            expect(plan).toHaveProperty("planId");
            expect(plan).toHaveProperty("tasks");
            expect(plan.tasks).toHaveLength(2);
        });

        it("should assign planId as a non-empty string", () => {
            const plan = PlanningEngine.createPlan([
                { task: "Test task" },
            ]);
            expect(plan.planId).toBeTruthy();
            expect(typeof plan.planId).toBe("string");
        });

        it("should auto-assign agent via RoutingEngine if not provided", () => {
            const plan = PlanningEngine.createPlan([
                { task: "Create a backend REST API" },
            ]);
            expect(plan.tasks[0].agent).toBeTruthy();
        });

        it("should use provided task IDs", () => {
            const plan = PlanningEngine.createPlan([
                { id: "TASK_01", task: "Test", agent: "@backend" },
            ]);
            expect(plan.tasks[0].id).toBe("TASK_01");
        });

        it("should auto-generate task IDs if not provided", () => {
            const plan = PlanningEngine.createPlan([
                { task: "Test", agent: "@backend" },
                { task: "Test 2", agent: "@frontend" },
            ]);
            expect(plan.tasks[0].id).toBeTruthy();
            expect(plan.tasks[1].id).toBeTruthy();
        });

        it("should include dependencies if provided", () => {
            const plan = PlanningEngine.createPlan([
                { id: "TASK_01", task: "Setup DB", agent: "@backend" },
                { id: "TASK_02", task: "Create API", agent: "@backend", dependencies: ["TASK_01"] },
            ]);
            expect(plan.tasks[1].dependencies).toContain("TASK_01");
        });
    });

    describe("validatePlan", () => {
        it("should validate a correct plan", () => {
            const plan = PlanningEngine.createPlan([
                { id: "TASK_01", task: "Setup DB", agent: "@backend" },
                { id: "TASK_02", task: "Create API", agent: "@backend", dependencies: ["TASK_01"] },
            ]);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect non-existent dependencies", () => {
            const plan = PlanningEngine.createPlan([
                { id: "TASK_01", task: "Create API", agent: "@backend", dependencies: ["TASK_99"] },
            ]);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes("non-existent"))).toBe(true);
        });

        it("should detect self-dependency", () => {
            // Manually create a plan with self-dependency
            const manualPlan = {
                planId: "PLAN_TEST" as unknown as PlanID,
                tasks: [
                    { id: "TASK_01" as unknown as TaskID, agent: "@backend", task: "Task", dependencies: ["TASK_01" as unknown as TaskID] },
                ],
            };
            const result = PlanningEngine.validatePlan(manualPlan);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes("cannot depend on itself"))).toBe(true);
        });

        it("should detect circular dependencies", () => {
            const circularPlan = {
                planId: "PLAN_CIRCULAR" as unknown as PlanID,
                tasks: [
                    { id: "TASK_01" as unknown as TaskID, agent: "@backend", task: "Task 1", dependencies: ["TASK_02" as unknown as TaskID] },
                    { id: "TASK_02" as unknown as TaskID, agent: "@backend", task: "Task 2", dependencies: ["TASK_01" as unknown as TaskID] },
                ],
            };
            const result = PlanningEngine.validatePlan(circularPlan);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes("Circular"))).toBe(true);
        });

        it("should validate a single task plan with no dependencies", () => {
            const plan = PlanningEngine.createPlan([
                { id: "TASK_01", task: "Single task", agent: "@backend" },
            ]);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(true);
        });
    });
});
