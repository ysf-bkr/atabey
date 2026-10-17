/**
 * Token Counter & FinOps Pricing Catalog (Phase 1.5)
 *
 * Uses the REAL `cl100k_base` BPE tokenizer via `js-tiktoken` (lite build +
 * cl100k ranks ≈ ±2% vs provider tokenizers). If the BPE table cannot be
 * loaded, it falls back to a cl100k-style pre-tokenization heuristic.
 *
 * Model-specific tokenizers (o200k_base, Claude, Gemini) are not applied yet;
 * `_model` is accepted for API compatibility. Use counts for FinOps awareness
 * and budget guardrails.
 */

import { Tiktoken } from "js-tiktoken/lite";
import cl100kRanks from "js-tiktoken/ranks/cl100k_base";

export interface ModelPricing {
    provider: "anthropic" | "openai" | "google" | "deepseek" | "generic";
    model: string;
    /** USD per 1,000,000 input tokens */
    inputPer1MUsd: number;
    /** USD per 1,000,000 output tokens */
    outputPer1MUsd: number;
    tokenizer: "cl100k_base" | "o200k_base" | "claude_bpe" | "gemini_spm";
}

export interface TokenUsageBreakdown {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
    model: string;
    provider: string;
}

/**
 * Up-to-date model pricing catalog (USD per 1M tokens).
 */
export const MODEL_PRICING_CATALOG: Record<string, ModelPricing> = {
    "claude-sonnet-4": {
        provider: "anthropic",
        model: "claude-sonnet-4",
        inputPer1MUsd: 3.0,
        outputPer1MUsd: 15.0,
        tokenizer: "claude_bpe",
    },
    "claude-opus-4": {
        provider: "anthropic",
        model: "claude-opus-4",
        inputPer1MUsd: 15.0,
        outputPer1MUsd: 75.0,
        tokenizer: "claude_bpe",
    },
    "claude-3-7-sonnet": {
        provider: "anthropic",
        model: "claude-3-7-sonnet",
        inputPer1MUsd: 3.0,
        outputPer1MUsd: 15.0,
        tokenizer: "claude_bpe",
    },
    "claude-3-5-sonnet": {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        inputPer1MUsd: 3.0,
        outputPer1MUsd: 15.0,
        tokenizer: "claude_bpe",
    },
    "claude-3-5-haiku": {
        provider: "anthropic",
        model: "claude-3-5-haiku",
        inputPer1MUsd: 0.8,
        outputPer1MUsd: 4.0,
        tokenizer: "claude_bpe",
    },
    "gpt-4o": {
        provider: "openai",
        model: "gpt-4o",
        inputPer1MUsd: 2.5,
        outputPer1MUsd: 10.0,
        tokenizer: "o200k_base",
    },
    "gpt-4o-mini": {
        provider: "openai",
        model: "gpt-4o-mini",
        inputPer1MUsd: 0.15,
        outputPer1MUsd: 0.6,
        tokenizer: "o200k_base",
    },
    "gpt-4.1": {
        provider: "openai",
        model: "gpt-4.1",
        inputPer1MUsd: 2.0,
        outputPer1MUsd: 8.0,
        tokenizer: "o200k_base",
    },
    "o3-mini": {
        provider: "openai",
        model: "o3-mini",
        inputPer1MUsd: 1.1,
        outputPer1MUsd: 4.4,
        tokenizer: "o200k_base",
    },
    "gemini-2.5-pro": {
        provider: "google",
        model: "gemini-2.5-pro",
        inputPer1MUsd: 1.25,
        outputPer1MUsd: 10.0,
        tokenizer: "gemini_spm",
    },
    "gemini-2.5-flash": {
        provider: "google",
        model: "gemini-2.5-flash",
        inputPer1MUsd: 0.15,
        outputPer1MUsd: 0.6,
        tokenizer: "gemini_spm",
    },
    "deepseek-chat": {
        provider: "deepseek",
        model: "deepseek-chat",
        inputPer1MUsd: 0.27,
        outputPer1MUsd: 1.1,
        tokenizer: "cl100k_base",
    },
};

/**
 * Official cl100k_base pre-tokenization pattern:
 * - English contractions ('s, 'd, 'm, 't, 'll, 've, 're)
 * - Optional space + Unicode letters
 * - Optional space + 1..3 Unicode digits (numbers split every 3 digits in cl100k)
 * - Optional space + non-whitespace/non-alphanumeric punctuation
 * - Newlines / trailing whitespace runs
 */
const CL100K_PRETOKEN_REGEX =
    /'(?:[sdmt]|ll|ve|re)| ?\p{L}+| ?\p{N}{1,3}| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

/**
 * Common high-frequency programming/English tokens that map 1:1 to a single BPE token
 * in cl100k_base / o200k_base.
 */
const SINGLE_BPE_WORDS = new Set([
    "function", "return", "const", "let", "var", "import", "export", "from", "async", "await",
    "interface", "type", "class", "public", "private", "protected", "static", "readonly",
    "string", "number", "boolean", "object", "undefined", "null", "true", "false", "void",
    "promise", "record", "array", "error", "default", "switch", "case", "break", "continue",
    "throw", "catch", "finally", "typeof", "instanceof", "extends", "implements", "constructor",
    "package", "module", "require", "process", "console", "Buffer", "Math", "JSON", "Date",
    "SELECT", "INSERT", "UPDATE", "DELETE", "FROM", "WHERE", "CREATE", "TABLE", "INDEX",
]);

/**
 * Estimate how many BPE subword tokens a single pre-token chunk splits into.
 */
function countChunkBpeTokens(chunk: string): number {
    const trimmed = chunk.trimStart();
    if (!trimmed) {
        // Pure whitespace run: 1 token per ~4 spaces or per newline group
        return Math.max(1, Math.ceil(chunk.length / 4));
    }

    // 1-3 digit numbers are guaranteed 1 token by CL100K_PRETOKEN_REGEX
    if (/^\p{N}{1,3}$/u.test(trimmed)) {
        return 1;
    }

    // Punctuation runs: common 1-3 char operators (===, !==, =>, ->, ::, ..., etc.) are 1 token
    if (/^[^\s\p{L}\p{N}]+$/u.test(trimmed)) {
        if (trimmed.length <= 3) return 1;
        return Math.ceil(trimmed.length / 2.5);
    }

    // ASCII word/identifier
    if (/^[A-Za-z]+$/.test(trimmed)) {
        if (trimmed.length <= 6 || SINGLE_BPE_WORDS.has(trimmed) || SINGLE_BPE_WORDS.has(trimmed.toLowerCase())) {
            return 1;
        }
        // Split camelCase / PascalCase subwords first
        const camelParts = trimmed.split(/(?=[A-Z][a-z])|(?<=[a-z])(?=[A-Z])/);
        if (camelParts.length > 1) {
            let subTokens = 0;
            for (const part of camelParts) {
                subTokens += part.length <= 6 ? 1 : Math.ceil(part.length / 4.5);
            }
            return subTokens;
        }
        // Longer natural word: BPE averages ~4.5 chars per subword token
        return Math.ceil(trimmed.length / 4.5);
    }

    // Non-ASCII Unicode (Turkish diacritics, CJK, emoji, etc.) — count UTF-8 byte density
    const byteLength = Buffer.byteLength(trimmed, "utf8");
    // In BPE, 2-byte UTF-8 chars (e.g. ş, ğ, ı, ö, ü, ç) take ~1 token per 2.8 bytes
    return Math.max(1, Math.ceil(byteLength / 2.8));
}

/**
 * Estimate BPE tokens in a string using cl100k-style pre-tokenization.
 * NOTE: approximate — see file header. `_model` is accepted for API
 * compatibility but per-model tokenizer differences are not yet applied.
 */
/** Heuristic fallback used only if the real BPE encoder cannot be initialised. */
function approximateCountTokens(text: string): number {
    const matches = text.match(CL100K_PRETOKEN_REGEX);
    if (!matches) return 0;

    let total = 0;
    for (const chunk of matches) {
        total += countChunkBpeTokens(chunk);
    }
    return total;
}

/** Lazily-initialised real cl100k_base BPE encoder (js-tiktoken, lite build). */
let realEncoder: Tiktoken | null = null;
let realEncoderFailed = false;

function getRealEncoder(): Tiktoken | null {
    if (realEncoder) return realEncoder;
    if (realEncoderFailed) return null;
    try {
        realEncoder = new Tiktoken(cl100kRanks);
        return realEncoder;
    } catch {
        realEncoderFailed = true;
        return null;
    }
}

/**
 * Count BPE tokens in a string.
 *
 * Uses the REAL `cl100k_base` tokenizer (js-tiktoken) for ~±2% accuracy.
 * Falls back to a cl100k-style heuristic only if the BPE table cannot load.
 */
export function countTokens(text: string, _model?: string): number {
    if (!text) return 0;
    const encoder = getRealEncoder();
    if (encoder) {
        try {
            return encoder.encode(text).length;
        } catch {
            /* fall through to heuristic */
        }
    }
    return approximateCountTokens(text);
}

/**
 * Resolve pricing for a given model name (supports partial matches and env overrides).
 */
export function resolveModelPricing(model?: string): ModelPricing {
    const requested = (model || process.env.ATABEY_MODEL || "claude-sonnet-4").toLowerCase().trim();
    if (MODEL_PRICING_CATALOG[requested]) {
        return MODEL_PRICING_CATALOG[requested];
    }
    for (const [key, pricing] of Object.entries(MODEL_PRICING_CATALOG)) {
        if (requested.includes(key) || key.includes(requested)) {
            return pricing;
        }
    }
    const envPer1k = parseFloat(process.env.ATABEY_COST_PER_1K_TOKENS_USD || "");
    if (Number.isFinite(envPer1k) && envPer1k > 0) {
        return {
            provider: "generic",
            model: requested || "custom",
            inputPer1MUsd: envPer1k * 1000,
            outputPer1MUsd: envPer1k * 1000,
            tokenizer: "cl100k_base",
        };
    }
    return MODEL_PRICING_CATALOG["claude-sonnet-4"];
}

/**
 * Calculate USD cost from separate input and output token counts.
 */
export function calculateModelCost(
    inputTokens: number,
    outputTokens: number,
    model?: string,
): { costUsd: number; pricing: ModelPricing } {
    const pricing = resolveModelPricing(model);
    const inputCost = (Math.max(0, inputTokens) / 1_000_000) * pricing.inputPer1MUsd;
    const outputCost = (Math.max(0, outputTokens) / 1_000_000) * pricing.outputPer1MUsd;
    const costUsd = Number((inputCost + outputCost).toFixed(8));
    return { costUsd, pricing };
}

/**
 * Compute full input/output token and FinOps cost breakdown for an MCP tool invocation.
 */
export function measureToolCallUsage(
    toolName: string,
    args: unknown,
    resultText: string,
    model?: string,
): TokenUsageBreakdown {
    const argsSerialized = typeof args === "string" ? args : JSON.stringify(args ?? {});
    // Include MCP tool framing overhead (+8 tokens for tool call envelope)
    const inputTokens = countTokens(toolName, model) + countTokens(argsSerialized, model) + 8;
    const outputTokens = countTokens(resultText || "", model);
    const { costUsd, pricing } = calculateModelCost(inputTokens, outputTokens, model);

    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        estimatedCostUsd: costUsd,
        model: pricing.model,
        provider: pricing.provider,
    };
}
