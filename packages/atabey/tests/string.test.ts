import { describe, it, expect } from "vitest";
import {
    insertTaskRow,
    sanitizeTableCell,
    normalizeAgentName,
    normalizePriority,
    slugifyName,
    titleCase
} from "../src/cli/utils/string.js";

describe("String Utilities", () => {
    describe("insertTaskRow", () => {
        it("should insert a row directly under the active tasks table divider", () => {
            const memoryContent = "## ACTIVE TASKS\n| Task | Status |\n| :--- | :--- | :--- | :--- | :--- |\n| Existing Task | Done |\n";
            const row = "| New Task | Pending |";
            const result = insertTaskRow(memoryContent, row);
            
            expect(result).toBe("## ACTIVE TASKS\n| Task | Status |\n| :--- | :--- | :--- | :--- | :--- |\n| New Task | Pending |\n| Existing Task | Done |\n");
        });

        it("should return null if ## ACTIVE TASKS section is missing", () => {
            const memoryContent = "## TASKS\n| :--- | :--- | :--- | :--- | :--- |\n";
            const result = insertTaskRow(memoryContent, "| Row |");
            expect(result).toBeNull();
        });

        it("should return null if table divider is missing", () => {
            const memoryContent = "## ACTIVE TASKS\n| Task | Status |\n";
            const result = insertTaskRow(memoryContent, "| Row |");
            expect(result).toBeNull();
        });
    });

    describe("sanitizeTableCell", () => {
        it("should escape vertical pipes", () => {
            expect(sanitizeTableCell("Value | with | pipes")).toBe("Value \\| with \\| pipes");
        });

        it("should replace newlines with spaces", () => {
            expect(sanitizeTableCell("Line 1\nLine 2\r\nLine 3")).toBe("Line 1 Line 2 Line 3");
        });

        it("should trim surrounding whitespace", () => {
            expect(sanitizeTableCell("   some value   ")).toBe("some value");
        });

        it("should handle non-string inputs", () => {
            expect(sanitizeTableCell(12345)).toBe("12345");
            expect(sanitizeTableCell(true)).toBe("true");
        });
    });

    describe("normalizeAgentName", () => {
        it("should remove leading @ symbols", () => {
            expect(normalizeAgentName("@manager")).toBe("manager");
            expect(normalizeAgentName("@@@coder")).toBe("coder");
        });

        it("should fallback to manager if name is empty, null or undefined", () => {
            expect(normalizeAgentName(undefined)).toBe("manager");
            expect(normalizeAgentName(null)).toBe("manager");
            expect(normalizeAgentName("")).toBe("manager");
            expect(normalizeAgentName("   ")).toBe("manager");
        });

        it("should trim whitespace", () => {
            expect(normalizeAgentName("  coder  ")).toBe("coder");
        });
    });

    describe("normalizePriority", () => {
        it("should accept valid priorities P0, P1, P2, P3", () => {
            expect(normalizePriority("P0")).toBe("P0");
            expect(normalizePriority("p1")).toBe("P1");
            expect(normalizePriority("  P3  ")).toBe("P3");
        });

        it("should fallback to P2 for invalid priorities", () => {
            expect(normalizePriority("P4")).toBe("P2");
            expect(normalizePriority("invalid")).toBe("P2");
            expect(normalizePriority(null)).toBe("P2");
            expect(normalizePriority(undefined)).toBe("P2");
        });
    });

    describe("slugifyName", () => {
        it("should convert to lowercase, replace special chars with hyphens and trim hyphens", () => {
            expect(slugifyName("Atabey App Core")).toBe("atabey-app-core");
            expect(slugifyName("Agent-Manager_123!")).toBe("agent-manager-123");
            expect(slugifyName("---Leading-Trailing---")).toBe("leading-trailing");
        });

        it("should fallback to atabey-app for empty or invalid slugs", () => {
            expect(slugifyName("")).toBe("atabey-app");
            expect(slugifyName("!!!")).toBe("atabey-app");
            expect(slugifyName(null as any)).toBe("atabey-app");
        });
    });

    describe("titleCase", () => {
        it("should format string to Title Case and handle delimiters", () => {
            expect(titleCase("atabey-app-core")).toBe("Atabey App Core");
            expect(titleCase("agent_manager_test")).toBe("Agent Manager Test");
            expect(titleCase("  multiple   spaces  ")).toBe("Multiple Spaces");
        });

        it("should fallback to Atabey App for empty input", () => {
            expect(titleCase("")).toBe("Atabey App");
            expect(titleCase(null as any)).toBe("Atabey App");
        });
    });
});
