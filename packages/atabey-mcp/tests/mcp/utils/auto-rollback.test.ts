/**
 * ─── AUTO-ROLLBACK TEST ───────────────────────────────────────────
 *
 * Tests the auto-rollback and regenerate mechanism.
 * Covers: snapshot capture, rollback, regenerate instructions, content validation.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("AutoRollback", () => {
    let AutoRollbackEngine: any;
    let tempDir: string;
    let testFilePath: string;

    beforeEach(async () => {
        vi.resetModules();
        // Create temp directory for file operations
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-rollback-test-"));
        testFilePath = path.join(tempDir, "test-file.ts");

        const mod = await import("../../../src/mcp/utils/auto-rollback.js");
        AutoRollbackEngine = mod.AutoRollbackEngine;
        AutoRollbackEngine.initialize();
    });

    afterEach(() => {
        // Cleanup temp directory
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    describe("Snapshot Capture", () => {
        it("should capture snapshot of existing file", () => {
            fs.writeFileSync(testFilePath, "const x = 1;", "utf8");
            AutoRollbackEngine.prepareWrite(testFilePath, "trace-1");

            const stats = AutoRollbackEngine.getSnapshotStats();
            expect(stats.total).toBeGreaterThanOrEqual(1);
            expect(stats.restored).toBe(0);
        });

        it("should capture snapshot of new file (null original)", () => {
            AutoRollbackEngine.prepareWrite(testFilePath, "trace-1");

            const stats = AutoRollbackEngine.getSnapshotStats();
            expect(stats.total).toBeGreaterThanOrEqual(1);
        });
    });

    describe("validateAndRollback", () => {
        it("should return null for no violations", () => {
            const result = AutoRollbackEngine.validateAndRollback(testFilePath, "const x = 1;", []);
            expect(result).toBeNull();
        });

        it("should restore original file content on violation", () => {
            // Create original file
            fs.writeFileSync(testFilePath, "const original = true;", "utf8");

            // Capture snapshot
            AutoRollbackEngine.prepareWrite(testFilePath, "trace-1");

            // Write violating content
            fs.writeFileSync(testFilePath, "const x: any = 1;", "utf8");

            // Validate and rollback
            const violations = [
                {
                    rule: "No `any` Type",
                    severity: "CRITICAL" as const,
                    filePath: testFilePath,
                    line: 1,
                    detail: "Line 1: : any",
                    regenerateInstruction: "Replace `any` with `unknown`",
                },
            ];

            const result = AutoRollbackEngine.validateAndRollback(testFilePath, "const x: any = 1;", violations);
            expect(result).not.toBeNull();
            expect(result!.length).toBe(1);

            // Verify file was restored
            const content = fs.readFileSync(testFilePath, "utf8");
            expect(content).toBe("const original = true;");
        });

        it("should delete new file on violation", () => {
            // Don't create file (simulating new file)
            AutoRollbackEngine.prepareWrite(testFilePath, "trace-1");

            // Write violating content
            fs.writeFileSync(testFilePath, "console.log('test');", "utf8");

            const violations = [
                {
                    rule: "No Console Log",
                    severity: "CRITICAL" as const,
                    filePath: testFilePath,
                    line: 1,
                    detail: "Line 1: console.log",
                    regenerateInstruction: "Use logger instead",
                },
            ];

            AutoRollbackEngine.validateAndRollback(testFilePath, "console.log('test');", violations);

            // Verify file was deleted
            expect(fs.existsSync(testFilePath)).toBe(false);
        });
    });

    describe("buildRegenerateInstruction", () => {
        it("should build instruction for critical violations", () => {
            const violations = [
                {
                    rule: "No `any` Type",
                    severity: "CRITICAL" as const,
                    filePath: "test.ts",
                    line: 5,
                    detail: "Line 5: : any",
                    regenerateInstruction: "Replace `any` with `unknown`",
                },
            ];

            const instruction = AutoRollbackEngine.buildRegenerateInstruction(violations, "write_file");
            expect(instruction).toContain("BLOCKED and ROLLED BACK");
            expect(instruction).toContain("No `any` Type");
            expect(instruction).toContain("Replace `any` with `unknown`");
            expect(instruction).toContain("regenerate");
        });

        it("should include all violations in instruction", () => {
            const violations = [
                {
                    rule: "No `any` Type",
                    severity: "CRITICAL" as const,
                    filePath: "test.ts",
                    line: 5,
                    detail: "Line 5: : any",
                    regenerateInstruction: "Replace `any` with `unknown`",
                },
                {
                    rule: "No Console Log",
                    severity: "CRITICAL" as const,
                    filePath: "test.ts",
                    line: 10,
                    detail: "Line 10: console.log",
                    regenerateInstruction: "Use logger instead",
                },
            ];

            const instruction = AutoRollbackEngine.buildRegenerateInstruction(violations, "write_file");
            expect(instruction).toContain("No `any` Type");
            expect(instruction).toContain("No Console Log");
            expect(instruction).toContain("Address ALL violations");
        });
    });

    describe("checkWriteContent", () => {
        it("should allow clean content", () => {
            const result = AutoRollbackEngine.checkWriteContent(
                testFilePath,
                "const x: string = 'hello';",
                "trace-1"
            );
            expect(result.allowed).toBe(true);
            expect(result.violations.length).toBe(0);
        });

        it("should block content with `any` type", () => {
            const result = AutoRollbackEngine.checkWriteContent(
                testFilePath,
                "const x: any = 1;",
                "trace-1"
            );
            expect(result.allowed).toBe(false);
            expect(result.violations.length).toBeGreaterThan(0);
            expect(result.violations[0].rule).toContain("any");
        });

        it("should block content with console.log", () => {
            const result = AutoRollbackEngine.checkWriteContent(
                testFilePath,
                "console.log('test');",
                "trace-1"
            );
            expect(result.allowed).toBe(false);
            expect(result.violations.length).toBeGreaterThan(0);
            expect(result.violations[0].rule).toContain("Console");
        });

        it("should skip non-source files", () => {
            const jsonPath = path.join(tempDir, "config.json");
            const result = AutoRollbackEngine.checkWriteContent(
                jsonPath,
                "{\"key\": \"value\"}",
                "trace-1"
            );
            expect(result.allowed).toBe(true);
        });

        it("should provide regenerate instruction when blocked", () => {
            const result = AutoRollbackEngine.checkWriteContent(
                testFilePath,
                "const x: any = 1;",
                "trace-1"
            );
            expect(result.instruction).not.toBeNull();
            expect(result.instruction).toContain("regenerate");
        });
    });

    describe("getSnapshotStats", () => {
        it("should return correct stats", () => {
            fs.writeFileSync(testFilePath, "const x = 1;", "utf8");
            AutoRollbackEngine.prepareWrite(testFilePath, "trace-1");

            const stats = AutoRollbackEngine.getSnapshotStats();
            expect(stats.total).toBeGreaterThanOrEqual(1);
            expect(typeof stats.restored).toBe("number");
            expect(typeof stats.pending).toBe("number");
        });
    });
});
