import { describe, expect, it } from "vitest";
import {
    buildSystemPromptOverride,
    getAllRules,
    getNonBypassableRules,
    getRulesByPriority,
    scanFileForViolations,
    validateArgsAgainstRules,
} from "../../src/utils/rules-engine.js";

describe("Rules Engine (Prompt Conflict Resolution)", () => {
    describe("getAllRules", () => {
        it("should return all governance rules", () => {
            const rules = getAllRules();
            expect(rules.length).toBeGreaterThan(0);
        });
    });

    describe("getRulesByPriority", () => {
        it("should return CRITICAL rules", () => {
            const critical = getRulesByPriority("CRITICAL");
            expect(critical.length).toBeGreaterThanOrEqual(3);
            critical.forEach(r => expect(r.priority).toBe("CRITICAL"));
        });

        it("should return HIGH rules", () => {
            const high = getRulesByPriority("HIGH");
            expect(high.length).toBeGreaterThanOrEqual(2);
            high.forEach(r => expect(r.priority).toBe("HIGH"));
        });

        it("should return MEDIUM rules", () => {
            const medium = getRulesByPriority("MEDIUM");
            expect(medium.length).toBeGreaterThanOrEqual(2);
            medium.forEach(r => expect(r.priority).toBe("MEDIUM"));
        });
    });

    describe("getNonBypassableRules", () => {
        it("should return only non-bypassable rules", () => {
            const rules = getNonBypassableRules();
            rules.forEach(r => expect(r.bypassable).toBe(false));
        });

        it("should include no-any-types as non-bypassable", () => {
            const rules = getNonBypassableRules();
            const ids = rules.map(r => r.id);
            expect(ids).toContain("no-any-types");
            expect(ids).toContain("no-console-log");
            expect(ids).toContain("no-hardcoded-secrets");
        });
    });

    describe("scanFileForViolations", () => {
        it("should detect 'any' type violations in TypeScript", () => {
            const content = "function foo(x: any): void {}";
            const violations = scanFileForViolations("test.ts", content);
            const anyViolations = violations.filter(v => v.rule.id === "no-any-types");
            expect(anyViolations.length).toBeGreaterThan(0);
        });

        it("should detect console.log violations", () => {
            const content = "console.log('hello');";
            const violations = scanFileForViolations("test.ts", content);
            const consoleViolations = violations.filter(v => v.rule.id === "no-console-log");
            expect(consoleViolations.length).toBeGreaterThan(0);
        });

        it("should not flag clean TypeScript code", () => {
            const content = "function foo(x: string): void { return; }";
            const violations = scanFileForViolations("test.ts", content);
            expect(violations.length).toBe(0);
        });

        it("should not scan non-TypeScript files for TypeScript rules", () => {
            const content = "function foo(x: any): void {}";
            const violations = scanFileForViolations("test.py", content);
            const anyViolations = violations.filter(v => v.rule.id === "no-any-types");
            expect(anyViolations.length).toBe(0);
        });
    });

    describe("validateArgsAgainstRules", () => {
        it("should block write_file with 'any' type in content", () => {
            const args = {
                path: "test.ts",
                content: "function foo(x: any): void {}",
            };
            const result = validateArgsAgainstRules("write_file", args);
            expect(result).not.toBeNull();
            expect(result).toContain("GOVERNANCE");
            expect(result).toContain("any");
        });

        it("should allow clean write_file content", () => {
            const args = {
                path: "test.ts",
                content: "function foo(x: string): void {}",
            };
            const result = validateArgsAgainstRules("write_file", args);
            expect(result).toBeNull();
        });

        it("should return null for non-file tools", () => {
            const args = { query: "SELECT * FROM users" };
            const result = validateArgsAgainstRules("run_shell_command", args);
            expect(result).toBeNull();
        });
    });

    describe("buildSystemPromptOverride", () => {
        it("should return a non-empty string", () => {
            const override = buildSystemPromptOverride();
            expect(override.length).toBeGreaterThan(0);
        });

        it("should mention Critical rules", () => {
            const override = buildSystemPromptOverride();
            expect(override).toContain("Critical Rules");
            expect(override).toContain("Non-Bypassable");
        });

        it("should mention HIGH priority rules", () => {
            const override = buildSystemPromptOverride();
            expect(override).toContain("High Priority");
        });
    });
});
