import { describe, expect, it } from "vitest";
import {
    calculateModelCost,
    countTokens,
    measureToolCallUsage,
    resolveModelPricing,
} from "../src/modules/agent/tokenizer.js";

describe("BPE Tokenizer & Token Pricing Catalog", () => {
    it("returns 0 for empty input and accurately splits cl100k pre-tokens", () => {
        expect(countTokens("")).toBe(0);
        expect(countTokens("const x = 42;")).toBeGreaterThanOrEqual(4);
        // Long camelCase identifier splits into multiple subword tokens
        const shortCount = countTokens("id");
        const camelCount = countTokens("handleCallToolWithGovernanceMiddleware");
        expect(camelCount).toBeGreaterThan(shortCount);
    });

    it("splits long digit sequences into 1-3 digit BPE groups", () => {
        // 9 digits -> 3 tokens in cl100k_base
        expect(countTokens("123456789")).toBe(3);
    });

    it("resolves model pricing and calculates distinct input/output USD costs", () => {
        const pricing = resolveModelPricing("claude-sonnet-4");
        expect(pricing.provider).toBe("anthropic");
        expect(pricing.inputPer1MUsd).toBe(3.0);
        expect(pricing.outputPer1MUsd).toBe(15.0);

        const { costUsd } = calculateModelCost(1_000_000, 1_000_000, "claude-sonnet-4");
        expect(costUsd).toBe(18.0);
    });

    it("measures full tool call input/output token breakdown", () => {
        const usage = measureToolCallUsage(
            "read_file",
            { path: "src/index.ts" },
            "export const hello = 'world';\n",
            "gpt-4o-mini",
        );
        expect(usage.inputTokens).toBeGreaterThan(8);
        expect(usage.outputTokens).toBeGreaterThan(0);
        expect(usage.totalTokens).toBe(usage.inputTokens + usage.outputTokens);
        expect(usage.model).toBe("gpt-4o-mini");
        expect(usage.provider).toBe("openai");
        expect(usage.estimatedCostUsd).toBeGreaterThan(0);
    });
});
