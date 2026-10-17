/**
 * ─── CONTEXT OPTIMIZER v2 ─────────────────────────────────────────────
 *
 * Solves IDE/CLI limit problems:
 * - Token limits (Claude 200K, GPT 128K, Cursor context)
 * - Context window overflow
 * - Rate limiting (tokens/min, calls/min)
 * - File read size limits
 * - Response size limits
 * - Session context persistence (recovery after disconnect)
 * - Smart prompt compression
 *
 * Multi-provider support: each IDE/CLI has different limits.
 *
 * ─── Provider Limits ──────────────────────────────────────────────
 * | Platform    | Context | Max Call | Rate (min) | Rate (hour) |
 * |-------------|---------|----------|------------|-------------|
 * | Claude Code | 200K    | 8K       | 100K       | 500K        |
 * | Cursor      | 100K    | 4K       | 50K        | 250K        |
 * | Gemini CLI  | 1M      | 32K      | 500K       | 2M          |
 * | VS Code     | 64K     | 4K       | 30K        | 150K        |
 * | GitHub Copilot | 64K | 4K       | 30K        | 150K        |
 */

import { countTokens } from "atabey-shared/tokenizer.js";

// ─── Provider-Specific Limits ─────────────────────────────────────

interface ProviderLimits {
    maxContextTokens: number;
    maxResponseTokens: number;
    maxTokensPerMinute: number;
    maxTokensPerHour: number;
    maxFileReadSize: number;     // bytes
    maxFileLines: number;
    charsPerToken: number;
    maxToolCallsPerMinute: number;
}

const PROVIDER_LIMITS: Record<string, ProviderLimits> = {
    "claude":      { maxContextTokens: 200000, maxResponseTokens: 8192,  maxTokensPerMinute: 100000, maxTokensPerHour: 500000, maxFileReadSize: 204800, maxFileLines: 400,  charsPerToken: 3.5, maxToolCallsPerMinute: 60 },
    "cursor":      { maxContextTokens: 100000, maxResponseTokens: 4096,  maxTokensPerMinute: 50000,  maxTokensPerHour: 250000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 30 },
    "opencode":    { maxContextTokens: 128000, maxResponseTokens: 8192,  maxTokensPerMinute: 80000,  maxTokensPerHour: 400000, maxFileReadSize: 204800, maxFileLines: 400,  charsPerToken: 3.5, maxToolCallsPerMinute: 60 },
    "antigravity": { maxContextTokens: 1000000, maxResponseTokens: 32768, maxTokensPerMinute: 500000, maxTokensPerHour: 2000000, maxFileReadSize: 512000, maxFileLines: 1000, charsPerToken: 3,   maxToolCallsPerMinute: 120 },
    "gemini":      { maxContextTokens: 1000000, maxResponseTokens: 32768, maxTokensPerMinute: 500000, maxTokensPerHour: 2000000, maxFileReadSize: 512000, maxFileLines: 1000, charsPerToken: 3,   maxToolCallsPerMinute: 120 },
    "grok":        { maxContextTokens: 128000, maxResponseTokens: 8192,  maxTokensPerMinute: 80000,  maxTokensPerHour: 400000, maxFileReadSize: 204800, maxFileLines: 400,  charsPerToken: 3.5, maxToolCallsPerMinute: 60 },
    "codex":       { maxContextTokens: 64000,  maxResponseTokens: 4096,  maxTokensPerMinute: 30000,  maxTokensPerHour: 150000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 20 },
    "vscode":      { maxContextTokens: 64000,  maxResponseTokens: 4096,  maxTokensPerMinute: 30000,  maxTokensPerHour: 150000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 20 },
    "copilot":     { maxContextTokens: 64000,  maxResponseTokens: 4096,  maxTokensPerMinute: 30000,  maxTokensPerHour: 150000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 20 },
    "local":       { maxContextTokens: 16000,  maxResponseTokens: 2048,  maxTokensPerMinute: 20000,  maxTokensPerHour: 100000, maxFileReadSize: 32768,  maxFileLines: 120,  charsPerToken: 4,   maxToolCallsPerMinute: 20 },
    "default":     { maxContextTokens: 100000, maxResponseTokens: 4000,  maxTokensPerMinute: 20000,  maxTokensPerHour: 100000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 30 },
};

// ─── Environment Overrides ────────────────────────────────────────

// Runtime overrides applied by updateTokenBudgetConfig() (dashboard API).
const runtimeBudgetOverrides: Partial<ProviderLimits> = {};

function getProviderLimits(provider: string): ProviderLimits {
    const base = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS["default"];
    const merged: ProviderLimits = { ...base, ...runtimeBudgetOverrides };
    return {
        maxContextTokens: parseInt(process.env.MCP_MAX_CONTEXT_TOKENS || String(merged.maxContextTokens), 10),
        maxResponseTokens: parseInt(process.env.MCP_MAX_RESPONSE_TOKENS || String(merged.maxResponseTokens), 10),
        maxTokensPerMinute: parseInt(process.env.MCP_MAX_TOKENS_PER_MINUTE || String(merged.maxTokensPerMinute), 10),
        maxTokensPerHour: parseInt(process.env.MCP_MAX_TOKENS_PER_HOUR || String(merged.maxTokensPerHour), 10),
        maxFileReadSize: parseInt(process.env.MCP_MAX_FILE_READ_SIZE || String(merged.maxFileReadSize), 10),
        maxFileLines: parseInt(process.env.MCP_MAX_FILE_LINES || String(merged.maxFileLines), 10),
        charsPerToken: parseFloat(process.env.MCP_CHARS_PER_TOKEN || String(merged.charsPerToken)),
        maxToolCallsPerMinute: parseInt(process.env.MCP_MAX_TOOL_CALLS_PER_MINUTE || String(merged.maxToolCallsPerMinute), 10),
    };
}

// ─── Provider detection & token estimation ────────────────────────

/** Per-agent tool-call timestamps (sliding 60s window) for rate limiting. */
const TOOL_CALL_RECORDS = new Map<string, number[]>();

/**
 * Detect provider from environment or client name.
 */
export function detectProvider(clientName: string): string {
    const name = clientName.toLowerCase();
    if (name.includes("claude")) return "claude";
    if (name.includes("cursor")) return "cursor";
    if (name.includes("opencode") || name.includes("open-code")) return "opencode";
    if (name.includes("antigravity") || name.includes("agy")) return "antigravity";
    if (name.includes("gemini")) return "gemini";
    if (name.includes("grok") || name.includes("xai")) return "grok";
    if (name.includes("codex")) return "codex";
    if (name.includes("copilot") || name.includes("github")) return "copilot";
    if (name.includes("vscode") || name.includes("visual studio")) return "vscode";
    if (name.includes("ollama") || name.includes("lmstudio") || name.includes("local") || name.includes("vllm")) return "local";
    return process.env.MCP_PROVIDER || "default";
}

/**
 * Estimate token count from text.
 *
 * Delegates to the shared approximate cl100k tokenizer so that budget checks,
 * smart truncation, and FinOps all report the SAME numbers (single source of
 * truth). The `provider` argument is kept for signature compatibility.
 */
export function estimateTokens(text: string, _provider: string = "default"): number {
    if (!text) return 0;
    return countTokens(text);
}

/**
 * Smart file truncation — preserves imports, type definitions, and function signatures.
 */
export function smartTruncateFile(
    content: string,
    filePath: string,
    provider: string = "default"
): string {
    const limits = getProviderLimits(provider);
    const estimatedTokens = estimateTokens(content, provider);

    if (estimatedTokens <= limits.maxResponseTokens) return content;

    const lines = content.split("\n");
    const maxLines = limits.maxFileLines;

    // Smart truncation: keep imports + type defs + first/last functions
    const importantLines: number[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Keep imports
        if (trimmed.startsWith("import ") || trimmed.startsWith("export ")) {
            importantLines.push(i);
            continue;
        }

        // Keep type/interface definitions
        if (trimmed.startsWith("type ") || trimmed.startsWith("interface ") || trimmed.startsWith("enum ")) {
            importantLines.push(i);
            // Also keep the next line (body start)
            if (i + 1 < lines.length) importantLines.push(i + 1);
            continue;
        }

        // Keep function/class signatures
        if (/^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const\s+\w+\s*(?::|=)\s*(?:async\s+)?\()/.test(trimmed)) {
            importantLines.push(i);
            continue;
        }

        // Keep JSDoc comments
        if (trimmed.startsWith("/**") || trimmed.startsWith("* ") || trimmed.startsWith("*/")) {
            importantLines.push(i);
            continue;
        }
    }

    // Build truncated content from important lines
    const importantSet = new Set(importantLines);
    const result: string[] = [];
    let lastKept = -1;

    for (let i = 0; i < Math.min(lines.length, maxLines * 2); i++) {
        if (importantSet.has(i)) {
            if (i - lastKept > 3) {
                result.push(`// ... ${i - lastKept - 1} lines omitted ...`);
            }
            result.push(lines[i]);
            lastKept = i;
        }
    }

    // Add remaining lines from the end of the file (last 10% or 50 lines)
    const tailCount = Math.min(50, Math.floor(lines.length * 0.1));
    if (tailCount > 0 && lastKept < lines.length - tailCount) {
        result.push(`// ... ${lines.length - lastKept - 1} lines omitted ...`);
        result.push(`// === LAST ${tailCount} LINES ===`);
        for (let i = lines.length - tailCount; i < lines.length; i++) {
            result.push(lines[i]);
        }
    }

    const truncated = result.join("\n");
    const newTokens = estimateTokens(truncated, provider);

    return `[SMART TRUNCATED] File "${filePath}" reduced from ${lines.length} lines (~${estimatedTokens} tokens) to ${result.length} lines (~${newTokens} tokens). Preserved imports, types, and function signatures.\n\n${truncated}`;
}

// ─── Token Budget Check (enhanced) ────────────────────────────────

/**
 * Enhanced token budget check with provider awareness.
 */
export function checkTokenBudget(
    agent: string,
    toolName: string,
    responseText: string,
    provider?: string
): string | null {
    const resolvedProvider = provider || detectProvider(agent);
    const limits = getProviderLimits(resolvedProvider);
    const budget = getOrCreateBudget(agent);
    const estimatedTokens = estimateTokens(responseText, resolvedProvider);

    // Check if agent is currently blocked
    if (budget.blockedUntil && Date.now() < budget.blockedUntil) {
        const remaining = Math.ceil((budget.blockedUntil - Date.now()) / 1000);
        return `[TOKEN BUDGET] Agent ${agent} blocked for ${remaining}s (${resolvedProvider} limit). Reduce request size or wait.`;
    }

    // 1. Per-call limit
    if (estimatedTokens > limits.maxResponseTokens) {
        return `[TOKEN BUDGET] Response ~${estimatedTokens} tokens exceeds ${resolvedProvider} limit of ${limits.maxResponseTokens}. Use smartTruncateFile.`;
    }

    // Record usage
    budget.records.push({ tokens: estimatedTokens, timestamp: Date.now(), toolName });
    budget.totalTokens += estimatedTokens;
    pruneOldRecords(budget);

    // 2. Per-minute limit
    const minuteTokens = sumTokensInWindow(budget, 60000);
    if (minuteTokens > limits.maxTokensPerMinute) {
        budget.blockedUntil = Date.now() + 30000;
        return `[TOKEN BUDGET] ${resolvedProvider} minute limit (${limits.maxTokensPerMinute}) exceeded. Cooldown 30s.`;
    }

    // 3. Per-hour limit
    const hourTokens = sumTokensInWindow(budget, 3600000);
    if (hourTokens > limits.maxTokensPerHour) {
        budget.blockedUntil = Date.now() + 120000;
        return `[TOKEN BUDGET] ${resolvedProvider} hour limit (${limits.maxTokensPerHour}) exceeded. Cooldown 2min.`;
    }

    // 4. Tool call rate limit
    const now = Date.now();
    const calls = TOOL_CALL_RECORDS.get(agent) || [];
    const recentCalls = calls.filter(t => now - t < 60000);
    if (recentCalls.length > limits.maxToolCallsPerMinute) {
        budget.blockedUntil = Date.now() + 15000;
        return `[RATE LIMIT] ${resolvedProvider} tool call limit (${limits.maxToolCallsPerMinute}/min) exceeded. Cooldown 15s.`;
    }
    recentCalls.push(now);
    TOOL_CALL_RECORDS.set(agent, recentCalls);

    return null;
}

// ─── Legacy compat exports ────────────────────────────────────────

interface AgentTokenBudget {
    records: Array<{ tokens: number; timestamp: number; toolName: string }>;
    totalTokens: number;
    lastWarning: number;
    blockedUntil: number | null;
}

const agentBudgets = new Map<string, AgentTokenBudget>();

function getOrCreateBudget(agent: string): AgentTokenBudget {
    if (!agentBudgets.has(agent)) {
        agentBudgets.set(agent, { records: [], totalTokens: 0, lastWarning: 0, blockedUntil: null });
    }
    return agentBudgets.get(agent)!;
}

function pruneOldRecords(budget: AgentTokenBudget): void {
    const oneHourAgo = Date.now() - 3600000;
    budget.records = budget.records.filter(r => r.timestamp > oneHourAgo);
}

function sumTokensInWindow(budget: AgentTokenBudget, windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return budget.records.filter(r => r.timestamp > cutoff).reduce((sum, r) => sum + r.tokens, 0);
}

export function getTokenBudgetStats(agent: string) {
    const budget = agentBudgets.get(agent);
    if (!budget) return { totalTokens: 0, recentMinute: 0, recentHour: 0, blocked: false, blockedRemaining: 0, callCount: 0 };
    pruneOldRecords(budget);
    return {
        totalTokens: budget.totalTokens,
        recentMinute: sumTokensInWindow(budget, 60000),
        recentHour: sumTokensInWindow(budget, 3600000),
        blocked: budget.blockedUntil !== null && Date.now() < budget.blockedUntil,
        blockedRemaining: budget.blockedUntil ? Math.max(0, budget.blockedUntil - Date.now()) : 0,
        callCount: budget.records.length,
    };
}

export function getAllTokenBudgetStats(): Record<string, ReturnType<typeof getTokenBudgetStats>> {
    const stats: Record<string, ReturnType<typeof getTokenBudgetStats>> = {};
    for (const [agent] of agentBudgets) stats[agent] = getTokenBudgetStats(agent);
    return stats;
}

export function resetTokenBudgets(): void { agentBudgets.clear(); TOOL_CALL_RECORDS.clear(); }

/**
 * Apply runtime token-budget overrides (from the dashboard API). Keys must be
 * valid ProviderLimits fields; unknown keys are ignored. Env vars still win.
 */
export function updateTokenBudgetConfig(newConfig: Record<string, number>): void {
    const defaults = PROVIDER_LIMITS["default"] as unknown as Record<string, number>;
    for (const [key, value] of Object.entries(newConfig)) {
        if (key in defaults && typeof value === "number" && Number.isFinite(value) && value > 0) {
            (runtimeBudgetOverrides as Record<string, number>)[key] = value;
        }
    }
}

export function getTokenBudgetConfig() { return { ...PROVIDER_LIMITS }; }

// ─── Token Budget Enforcement (opt-in) ────────────────────────────

/**
 * Whether token/rate budget breaches should HARD-BLOCK tool calls.
 * Opt-in via `ATABEY_TOKEN_BUDGET_ENFORCE=true` (default: advisory only).
 */
export function isTokenBudgetEnforced(): boolean {
    const v = (process.env.ATABEY_TOKEN_BUDGET_ENFORCE || "").toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
}

/**
 * Pre-execution token/rate budget gate.
 *
 * Returns a block message when the agent is over its token/rate budget AND
 * enforcement is enabled; `null` otherwise (advisory mode). Usage recording
 * still happens post-execution via `checkTokenBudget`.
 */
export function enforceTokenBudgetPreCall(agent: string, _toolName: string): string | null {
    if (!isTokenBudgetEnforced()) return null;

    const resolvedProvider = detectProvider(agent);
    const limits = getProviderLimits(resolvedProvider);
    const budget = getOrCreateBudget(agent);

    if (budget.blockedUntil && Date.now() < budget.blockedUntil) {
        const remaining = Math.ceil((budget.blockedUntil - Date.now()) / 1000);
        return `[TOKEN BUDGET] Agent ${agent} blocked for ${remaining}s (${resolvedProvider} limit). Reduce request size or wait.`;
    }

    pruneOldRecords(budget);

    const minuteTokens = sumTokensInWindow(budget, 60000);
    if (minuteTokens > limits.maxTokensPerMinute) {
        budget.blockedUntil = Date.now() + 30000;
        return `[TOKEN BUDGET] ${resolvedProvider} minute token limit (${limits.maxTokensPerMinute}) exceeded by ${agent}. Cooldown 30s. Use smaller reads (line ranges) or fewer calls.`;
    }

    const hourTokens = sumTokensInWindow(budget, 3600000);
    if (hourTokens > limits.maxTokensPerHour) {
        budget.blockedUntil = Date.now() + 120000;
        return `[TOKEN BUDGET] ${resolvedProvider} hour token limit (${limits.maxTokensPerHour}) exceeded by ${agent}. Cooldown 2min.`;
    }

    return null;
}
