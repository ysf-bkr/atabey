import { beforeEach, describe, expect, it } from "vitest";
import {
    checkTokenBudget,
    estimateTokens,
    getTokenBudgetStats,
    resetTokenBudgets,
    truncateFileContent,
} from "../../src/utils/context-optimizer.js";

describe("Context Optimizer", () => {
    beforeEach(() => {
        resetTokenBudgets();
    });

    describe("estimateTokens", () => {
        it("should estimate tokens from text (4 chars per token)", () => {
            expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
        });

        it("should return 0 for empty text", () => {
            expect(estimateTokens("")).toBe(0);
        });

        it("should return 0 for null/undefined", () => {
            expect(estimateTokens(null as unknown as string)).toBe(0);
        });
    });

    describe("checkTokenBudget", () => {
        it("should allow responses within token budget", () => {
            const result = checkTokenBudget("test-agent", "read_file", "small response");
            expect(result).toBeNull();
        });

        it("should block responses exceeding MAX_TOKENS_PER_CALL", () => {
            const largeText = "x".repeat(20000); // ~5000 tokens
            const result = checkTokenBudget("test-agent", "read_file", largeText);
            expect(result).toContain("TOKEN BUDGET");
            expect(result).toContain("too large");
        });

        it("should track token usage per agent", () => {
            checkTokenBudget("agent-1", "read_file", "small");
            checkTokenBudget("agent-2", "write_file", "tiny");

            const stats1 = getTokenBudgetStats("agent-1");
            const stats2 = getTokenBudgetStats("agent-2");

            expect(stats1.callCount).toBe(1);
            expect(stats2.callCount).toBe(1);
        });
    });

    describe("truncateFileContent", () => {
        it("should not truncate small content", () => {
            const content = "line1\nline2\nline3";
            const result = truncateFileContent(content, "test.ts", 100);
            expect(result).toBe(content);
        });

        it("should truncate large content with header note", () => {
            const lines = Array.from({ length: 500 }, (_, i) => `line ${i + 1}`);
            const content = lines.join("\n");
            const result = truncateFileContent(content, "large.ts", 10);

            expect(result).toContain("[TRUNCATED]");
            expect(result).toContain("large.ts");
            expect(result).toContain("more lines truncated");
        });
    });

    describe("getTokenBudgetStats", () => {
        it("should return zero stats for unknown agent", () => {
            const stats = getTokenBudgetStats("unknown-agent");
            expect(stats.totalTokens).toBe(0);
            expect(stats.callCount).toBe(0);
            expect(stats.blocked).toBe(false);
        });
    });
});
