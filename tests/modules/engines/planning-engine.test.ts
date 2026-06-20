import { describe, expect, it } from "vitest";
import { PlanningEngine } from "../../../src/modules/engines/planning-engine.js";

describe("PlanningEngine", () => {
    describe("createPlan", () => {
        it("should create a plan with valid structure", () => {
            const rawTasks = [
                { task: "Create database schema", agent: "@database" },
                { task: "Build API endpoints", agent: "@backend", dependencies: ["TASK_01"] },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            expect(plan.planId).toBeDefined();
            expect(plan.tasks).toHaveLength(2);
            expect(plan.tasks[0].id).toBe("TASK_01");
            expect(plan.tasks[1].dependencies).toContain("TASK_01");
        });

        it("should auto-assign agents via RoutingEngine when not specified", () => {
            const rawTasks = [
                { task: "Create a React login page" },
                { task: "Deploy to Docker" },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            expect(plan.tasks[0].agent).toContain("@");
            expect(plan.tasks[1].agent).toContain("@");
        });

        it("should accept custom task IDs", () => {
            const rawTasks = [
                { id: "CUSTOM_01", task: "Setup CI/CD", agent: "@devops" },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            expect(plan.tasks[0].id).toBe("CUSTOM_01");
        });
    });

    describe("validatePlan", () => {
        it("should return valid for a correct plan", () => {
            const rawTasks = [
                { id: "TASK_01", task: "Setup database", agent: "@database" },
                { id: "TASK_02", task: "Create API", agent: "@backend", dependencies: ["TASK_01"] },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it("should detect non-existent dependencies", () => {
            const rawTasks = [
                { id: "TASK_01", task: "Setup database", agent: "@database", dependencies: ["NONEXISTENT"] },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes("non-existent dependency"))).toBe(true);
        });

        it("should detect self-dependency", () => {
            const rawTasks = [
                { id: "TASK_01", task: "Setup database", agent: "@database", dependencies: ["TASK_01"] },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes("cannot depend on itself"))).toBe(true);
        });

        it("should detect circular dependencies", () => {
            const rawTasks = [
                { id: "TASK_01", task: "Task 1", agent: "@backend", dependencies: ["TASK_02"] },
                { id: "TASK_02", task: "Task 2", agent: "@backend", dependencies: ["TASK_03"] },
                { id: "TASK_03", task: "Task 3", agent: "@backend", dependencies: ["TASK_01"] },
            ];
            const plan = PlanningEngine.createPlan(rawTasks);
            const result = PlanningEngine.validatePlan(plan);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes("Circular dependency"))).toBe(true);
        });
    });
});
