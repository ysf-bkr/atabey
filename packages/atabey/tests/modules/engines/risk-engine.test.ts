import { describe, expect, it } from "vitest";
import { RiskEngine } from "../../../src/modules/engines/risk-engine.js";

describe("RiskEngine", () => {
    describe("assessTaskRisk", () => {
        it("should return LOW risk for safe tasks", () => {
            const result = RiskEngine.assessTaskRisk("Create a new user interface component");
            expect(result.severity).toBe("LOW");
            expect(result.totalScore).toBeLessThan(20);
            expect(result.requiresApproval).toBe(false);
        });

        it("should flag HIGH risk for delete operations", () => {
            const result = RiskEngine.assessTaskRisk("Delete the entire database schema");
            expect(result.severity).toBe("HIGH");
            expect(result.totalScore).toBeGreaterThanOrEqual(50);
        });

        it("should flag CRITICAL risk for combined dangerous keywords", () => {
            const result = RiskEngine.assessTaskRisk("Delete all auth tokens and drop database truncate everything purge logs");
            expect(result.severity).toBe("CRITICAL");
            expect(result.totalScore).toBeGreaterThanOrEqual(80);
        });

        it("should detect sensitive path access", () => {
            const result = RiskEngine.assessTaskRisk("Modify the security configuration in .env file");
            expect(result.factors.some(f => f.factor.includes("Sensitive Path"))).toBe(true);
        });

        it("should flag high complexity for long tasks", () => {
            const longTask = "x".repeat(301);
            const result = RiskEngine.assessTaskRisk(longTask);
            expect(result.factors.some(f => f.factor === "High Complexity")).toBe(true);
        });

        it("should require approval for score >= 60", () => {
            const result = RiskEngine.assessTaskRisk("delete drop truncate purge");
            expect(result.requiresApproval).toBe(true);
            expect(result.totalScore).toBeGreaterThanOrEqual(60);
        });

        it("should return detailed risk factors", () => {
            const result = RiskEngine.assessTaskRisk("Delete the auth database");
            expect(result.factors.length).toBeGreaterThan(0);
            result.factors.forEach(factor => {
                expect(factor).toHaveProperty("factor");
                expect(factor).toHaveProperty("score");
                expect(factor).toHaveProperty("description");
            });
        });
    });

    describe("assessChangeRisk", () => {
        it("should assess write operations as higher risk than replace", () => {
            const writeResult = RiskEngine.assessChangeRisk("src/config/env.ts", "write");
            const replaceResult = RiskEngine.assessChangeRisk("src/config/env.ts", "replace");
            expect(writeResult.totalScore).toBeGreaterThan(replaceResult.totalScore);
        });

        it("should detect sensitive file paths", () => {
            const result = RiskEngine.assessChangeRisk(".env", "write");
            expect(result.factors.some(f => f.factor.includes("Sensitive File"))).toBe(true);
        });

        it("should not flag non-sensitive paths as sensitive", () => {
            const result = RiskEngine.assessChangeRisk("src/components/Button.tsx", "patch");
            expect(result.factors.filter(f => f.factor.includes("Sensitive File")).length).toBe(0);
        });
    });
});
