import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QualityGate } from "../../src/modules/engines/quality-gate.js";

describe("QualityGate", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv, VITEST: "true" };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("check", () => {
        it("should pass valid output", async () => {
            const result = await QualityGate.check(
                "@backend",
                "function add(a: number, b: number): number { return a + b; }",
                "Create an add function"
            );
            expect(result.passed).toBe(true);
            expect(result.reason).toContain("passed");
        });

        it("should fail empty output", async () => {
            const result = await QualityGate.check(
                "@backend",
                "",
                "Do something"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("empty");
        });

        it("should fail short output", async () => {
            const result = await QualityGate.check(
                "@backend",
                "short",
                "Do something"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("short");
        });

        it("should fail output containing ERROR", async () => {
            const result = await QualityGate.check(
                "@backend",
                "This is a long enough output but contains ERROR in it",
                "Do something"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("ERROR");
        });

        it("should fail output containing FAILED", async () => {
            const result = await QualityGate.check(
                "@backend",
                "This is a long enough output but the task FAILED",
                "Do something"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("FAILED");
        });

        it("should fail output containing TIMEOUT", async () => {
            const result = await QualityGate.check(
                "@backend",
                "This is a long enough output but it TIMEOUT",
                "Do something"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("TIMEOUT");
        });

        it("should fail output with `any` type violation", async () => {
            const result = await QualityGate.check(
                "@backend",
                "function process(data: any): any { return data; }",
                "Create a process function"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("any");
        });

        it("should pass output with proper TypeScript types", async () => {
            const result = await QualityGate.check(
                "@backend",
                "function process(data: string): Record<string, unknown> { return { result: data }; }",
                "Create a process function"
            );
            expect(result.passed).toBe(true);
        });

        it("should handle CRASHED indicator", async () => {
            const result = await QualityGate.check(
                "@backend",
                "The application CRASHED during execution of this long enough output",
                "Run application"
            );
            expect(result.passed).toBe(false);
            expect(result.reason).toContain("CRASHED");
        });
    });
});
