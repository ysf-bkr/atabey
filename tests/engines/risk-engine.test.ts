import { describe, expect, it } from "vitest";
import { RiskEngine } from "../../src/modules/engines/risk-engine.js";

describe("RiskEngine", () => {
    describe("assessTaskRisk", () => {
        it("should return LOW risk for safe tasks", () => {
            const result = RiskEngine.assessTaskRisk("Create a new user endpoint");
            expect(result.severity).toBe("LOW");
            expect(result.requiresApproval).toBe(false);
            expect(result.totalScore).toBeLessThan(20);
        });

        it("should detect DELETE keyword as high risk", () => {
            const result = RiskEngine.assessTaskRisk("Delete all records from the users table");
            expect(result.factors.some(f => f.factor.includes("delete"))).toBe(true);
            expect(result.totalScore).toBeGreaterThanOrEqual(40);
        });

        it("should detect DROP keyword as high risk", () => {
            const result = RiskEngine.assessTaskRisk("DROP the old table");
            expect(result.factors.some(f => f.factor.includes("drop"))).toBe(true);
        });

        it("should detect TRUNCATE keyword as high risk", () => {
            const result = RiskEngine.assessTaskRisk("TRUNCATE the logs table");
            expect(result.factors.some(f => f.factor.includes("truncate"))).toBe(true);
        });

        it("should detect rm -rf as high risk", () => {
            const result = RiskEngine.assessTaskRisk("Run rm -rf / to clean up");
            expect(result.factors.some(f => f.factor.includes("rm -rf"))).toBe(true);
            expect(result.severity).toBe("HIGH");
        });

        it("should detect sensitive paths in task", () => {
            const result = RiskEngine.assessTaskRisk("Modify the .env configuration file");
            expect(result.factors.some(f => f.factor.includes(".env"))).toBe(true);
        });

        it("should require approval for score >= 60", () => {
            const result = RiskEngine.assessTaskRisk("Delete all records, DROP the table, and purge the cache");
            expect(result.requiresApproval).toBe(true);
            expect(result.totalScore).toBeGreaterThanOrEqual(60);
        });

        it("should add complexity risk for long tasks", () => {
            const longTask = "a".repeat(301);
            const result = RiskEngine.assessTaskRisk(longTask);
            expect(result.factors.some(f => f.factor.includes("Complexity"))).toBe(true);
        });

        it("should not exceed max score of 100", () => {
            const result = RiskEngine.assessTaskRisk("delete drop truncate rm -rf purge format force");
            expect(result.totalScore).toBeLessThanOrEqual(100);
        });

        it("should detect PURGE keyword", () => {
            const result = RiskEngine.assessTaskRisk("Purge all old records");
            expect(result.factors.some(f => f.factor.includes("purge"))).toBe(true);
        });

        it("should detect FORCE keyword", () => {
            const result = RiskEngine.assessTaskRisk("Force delete the directory");
            expect(result.factors.some(f => f.factor.includes("force"))).toBe(true);
        });
    });

    describe("assessChangeRisk", () => {
        it("should assess write operations as higher risk", () => {
            const result = RiskEngine.assessChangeRisk("src/file.ts", "write");
            expect(result.factors.some(f => f.factor.includes("write"))).toBe(true);
        });

        it("should assess replace operations as lower risk", () => {
            const writeResult = RiskEngine.assessChangeRisk("src/file.ts", "write");
            const replaceResult = RiskEngine.assessChangeRisk("src/file.ts", "replace");
            expect(writeResult.totalScore).toBeGreaterThan(replaceResult.totalScore);
        });

        it("should detect sensitive file paths", () => {
            const result = RiskEngine.assessChangeRisk(".env", "write");
            expect(result.factors.some(f => f.factor.includes(".env"))).toBe(true);
        });

        it("should detect config file changes", () => {
            const result = RiskEngine.assessChangeRisk("src/config/database.ts", "write");
            expect(result.factors.some(f => f.factor.includes("config"))).toBe(true);
        });

        it("should detect atabey framework file changes", () => {
            const result = RiskEngine.assessChangeRisk(".atabey/config.json", "write");
            expect(result.factors.some(f => f.factor.includes("atabey"))).toBe(true);
        });
    });
});
