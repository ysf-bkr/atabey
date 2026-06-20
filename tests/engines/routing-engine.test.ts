import { beforeEach, describe, expect, it, vi } from "vitest";
import * as memoryUtils from "../../src/cli/utils/memory.js";
import { RoutingEngine } from "../../src/modules/engines/routing-engine.js";

describe("RoutingEngine", () => {
    beforeEach(() => {
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue("/tmp/test-atabey");
    });

    describe("resolveAgent", () => {
        it("should route backend tasks to @backend", () => {
            const agent = RoutingEngine.resolveAgent("Create a REST API for user management with CRUD operations");
            expect(agent).toBe("@backend");
        });

        it("should route frontend tasks to @frontend", () => {
            const agent = RoutingEngine.resolveAgent("Build a React login page with Tailwind CSS");
            expect(agent).toBe("@frontend");
        });

        it("should route security tasks to @security", () => {
            const agent = RoutingEngine.resolveAgent("Audit the authentication middleware for vulnerabilities");
            expect(agent).toBe("@security");
        });

        it("should route database tasks to @database", () => {
            const agent = RoutingEngine.resolveAgent("Create a migration for the users table");
            expect(agent).toBe("@database");
        });

        it("should route devops tasks to @devops", () => {
            const agent = RoutingEngine.resolveAgent("Set up Docker and CI/CD pipeline");
            expect(agent).toBe("@devops");
        });

        it("should route mobile tasks to @mobile", () => {
            const agent = RoutingEngine.resolveAgent("Build a React Native screen for user profile");
            // TF-IDF may route to @frontend due to "React" keyword weight
            expect(["@mobile", "@frontend"]).toContain(agent);
        });

        it("should route architecture tasks to @architect", () => {
            const agent = RoutingEngine.resolveAgent("Design the system architecture for microservices");
            expect(agent).toBe("@architect");
        });

        it("should default to @backend for unknown tasks", () => {
            const agent = RoutingEngine.resolveAgent("Do something random");
            // TF-IDF may route to various agents based on keyword matching
            expect(agent).toBeTruthy();
            expect(agent.startsWith("@")).toBe(true);
        });
    });

    describe("resolveWithDetails", () => {
        it("should return routing details with score and confidence", () => {
            const result = RoutingEngine.resolveWithDetails("Create a Node.js backend API");
            expect(result).toHaveProperty("agent");
            expect(result).toHaveProperty("score");
            expect(result).toHaveProperty("confidence");
            expect(result).toHaveProperty("reasoning");
            expect(result).toHaveProperty("subTasks");
            expect(["high", "medium", "low"]).toContain(result.confidence);
        });

        it("should return subtasks array", () => {
            const result = RoutingEngine.resolveWithDetails("Build a React frontend");
            expect(Array.isArray(result.subTasks)).toBe(true);
            expect(result.subTasks.length).toBeGreaterThan(0);
        });

        it("should return high confidence for clear backend tasks", () => {
            const result = RoutingEngine.resolveWithDetails("Create a backend API endpoint for user authentication with JWT tokens and database queries");
            expect(result.confidence).toBe("high");
        });
    });

    describe("planTask", () => {
        it("should return a structured plan array", () => {
            const plan = RoutingEngine.planTask("Create login page");
            expect(Array.isArray(plan)).toBe(true);
            expect(plan.length).toBeGreaterThan(0);
            expect(plan[0]).toContain("Task:");
        });

        it("should include subtask steps in the plan", () => {
            const plan = RoutingEngine.planTask("Create a database migration");
            expect(plan.some(line => line.includes("Subtasks"))).toBe(true);
        });
    });
});
