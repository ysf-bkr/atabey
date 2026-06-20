import { describe, expect, it } from "vitest";
import { RoutingEngine } from "../../../src/modules/engines/routing-engine.js";

describe("RoutingEngine", () => {
    describe("resolveWithDetails", () => {
        it("should route frontend tasks to @frontend", () => {
            const result = RoutingEngine.resolveWithDetails("Create a login page with React components");
            expect(result.agent).toBe("@frontend");
            expect(result.score).toBeGreaterThan(0);
        });

        it("should route security tasks to @security", () => {
            const result = RoutingEngine.resolveWithDetails("Audit authentication tokens and encryption");
            expect(result.agent).toBe("@security");
            expect(result.score).toBeGreaterThan(0);
        });

        it("should route database tasks to @database", () => {
            const result = RoutingEngine.resolveWithDetails("Create migration for user schema");
            expect(result.agent).toBe("@database");
            expect(result.score).toBeGreaterThan(0);
        });

        it("should route backend tasks to @backend as fallback", () => {
            const result = RoutingEngine.resolveWithDetails("Implement business logic");
            expect(result.agent).toBe("@backend");
        });

        it("should route devops tasks to @devops", () => {
            const result = RoutingEngine.resolveWithDetails("Deploy to production with Docker");
            expect(result.agent).toBe("@devops");
            expect(result.score).toBeGreaterThan(0);
        });

        it("should provide confidence level based on score", () => {
            const highResult = RoutingEngine.resolveWithDetails("frontend ui react component button css html responsive");
            expect(["high", "medium", "low"]).toContain(highResult.confidence);

            const lowResult = RoutingEngine.resolveWithDetails("xy");
            expect(lowResult.confidence).toBe("low");
        });

        it("should generate subtasks for the selected agent", () => {
            const result = RoutingEngine.resolveWithDetails("Build a mobile app with React Native");
            expect(result.subTasks.length).toBeGreaterThan(0);
            expect(result.subTasks.some(st => st.includes(result.agent))).toBe(true);
        });
    });

    describe("resolveAgent", () => {
        it("should return agent name string", () => {
            const agent = RoutingEngine.resolveAgent("Fix database query performance");
            expect(agent).toContain("@");
        });
    });

    describe("planTask", () => {
        it("should return a structured plan array", () => {
            const plan = RoutingEngine.planTask("Create a new API endpoint");
            expect(plan.length).toBeGreaterThan(5);
            expect(plan[0]).toContain("Task:");
            expect(plan[1]).toContain("Assigned to:");
        });
    });
});
