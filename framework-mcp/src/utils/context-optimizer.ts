/**
 * ─── CONTEXT OPTIMIZER ─────────────────────────────────────────────
 *
 * Prevents context poisoning and runaway token consumption by AI CLIs.
 * Acts as a Circuit Breaker at the MCP middleware layer.
 *
 * Features:
 * - Token Budget Enforcer: Max tokens per tool call response
 * - File Read Limiter: Auto-truncate large file reads
 * - Token-Based Rate Limiter: Max token spend per window
 * - Response Size Governor: Truncates oversized responses
 *
 * [KVKK/GDPR] Also prevents PII leakage via oversized responses.
 */

// ─── Configuration ────────────────────────────────────────────────

const CONFIG = {
    /** Max tokens allowed in a single tool response */
    MAX_TOKENS_PER_CALL: parseInt(process.env.MCP_MAX_TOKENS_PER_CALL || "4000", 10),
    /** Max tokens per minute across all calls for an agent */
    MAX_TOKENS_PER_MINUTE: parseInt(process.env.MCP_MAX_TOKENS_PER_MINUTE || "20000", 10),
    /** Max tokens per hour across all calls for an agent */
    MAX_TOKENS_PER_HOUR: parseInt(process.env.MCP_MAX_TOKENS_PER_HOUR || "100000", 10),
    /** Max file size in bytes before auto-truncation (100KB) */
    MAX_FILE_READ_SIZE: parseInt(process.env.MCP_MAX_FILE_READ_SIZE || "102400", 10),
    /** Max lines to return for truncated files */
    MAX_FILE_LINES: parseInt(process.env.MCP_MAX_FILE_LINES || "200", 10),
    /** Token estimation ratio (chars per token) */
    CHARS_PER_TOKEN: 4,
};

// ─── Token Tracking ───────────────────────────────────────────────

interface TokenRecord {
    tokens: number;
    timestamp: number;
    toolName: string;
}

interface AgentTokenBudget {
    records: TokenRecord[];
    totalTokens: number;
    lastWarning: number;
    blockedUntil: number | null;
}

const agentBudgets = new Map<string, AgentTokenBudget>();

function getOrCreateBudget(agent: string): AgentTokenBudget {
    if (!agentBudgets.has(agent)) {
        agentBudgets.set(agent, {
            records: [],
            totalTokens: 0,
            lastWarning: 0,
            blockedUntil: null,
        });
    }
    return agentBudgets.get(agent)!;
}

function pruneOldRecords(agent: AgentTokenBudget): void {
    const oneHourAgo = Date.now() - 3600000;
    agent.records = agent.records.filter(r => r.timestamp > oneHourAgo);
}

function sumTokensInWindow(agent: AgentTokenBudget, windowMs: number): number {
    const cutoff = Date.now() - windowMs;
    return agent.records
        .filter(r => r.timestamp > cutoff)
        .reduce((sum, r) => sum + r.tokens, 0);
}

/**
 * Estimate token count from text.
 * Uses 4 chars per token as a conservative estimate.
 */
export function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / CONFIG.CHARS_PER_TOKEN);
}

/**
 * Check if a tool response is within token budget.
 * Returns null if allowed, or an error message if blocked.
 */
export function checkTokenBudget(
    agent: string,
    toolName: string,
    responseText: string
): string | null {
    const budget = getOrCreateBudget(agent);

    // Check if agent is currently blocked
    if (budget.blockedUntil && Date.now() < budget.blockedUntil) {
        const remaining = Math.ceil((budget.blockedUntil - Date.now()) / 1000);
        return `[TOKEN BUDGET] Agent ${agent} is blocked for ${remaining}s. Token limit exceeded.`;
    }

    const estimatedTokens = estimateTokens(responseText);

    // 1. Check per-call limit
    if (estimatedTokens > CONFIG.MAX_TOKENS_PER_CALL) {
        return `[TOKEN BUDGET] Response too large: ~${estimatedTokens} tokens (max: ${CONFIG.MAX_TOKENS_PER_CALL}). Truncate your request.`;
    }

    // Record the token usage
    budget.records.push({
        tokens: estimatedTokens,
        timestamp: Date.now(),
        toolName,
    });
    budget.totalTokens += estimatedTokens;

    // Prune old records
    pruneOldRecords(budget);

    // 2. Check per-minute limit
    const minuteTokens = sumTokensInWindow(budget, 60000);
    if (minuteTokens > CONFIG.MAX_TOKENS_PER_MINUTE) {
        budget.blockedUntil = Date.now() + 30000; // 30s cooldown
        return `[TOKEN BUDGET] Agent ${agent} exceeded ${CONFIG.MAX_TOKENS_PER_MINUTE} tokens/min. Cooldown 30s.`;
    }

    // 3. Check per-hour limit
    const hourTokens = sumTokensInWindow(budget, 3600000);
    if (hourTokens > CONFIG.MAX_TOKENS_PER_HOUR) {
        budget.blockedUntil = Date.now() + 120000; // 2min cooldown
        return `[TOKEN BUDGET] Agent ${agent} exceeded ${CONFIG.MAX_TOKENS_PER_HOUR} tokens/hour. Cooldown 2min.`;
    }

    // 4. Warning at 80% of per-minute limit
    if (minuteTokens > CONFIG.MAX_TOKENS_PER_MINUTE * 0.8) {
        const now = Date.now();
        if (now - budget.lastWarning > 10000) { // Throttle warnings to once per 10s
            budget.lastWarning = now;
            process.stderr.write(`[TOKEN BUDGET WARNING] Agent ${agent} at ${Math.round(minuteTokens / CONFIG.MAX_TOKENS_PER_MINUTE * 100)}% of minute token budget.\n`);
        }
    }

    return null;
}

/**
 * Truncate file content to fit within token budget.
 * Returns truncated content with a header note.
 */
export function truncateFileContent(
    content: string,
    filePath: string,
    maxTokens: number = CONFIG.MAX_TOKENS_PER_CALL
): string {
    const estimatedTokens = estimateTokens(content);
    if (estimatedTokens <= maxTokens) return content;

    const lines = content.split("\n");
    const maxLines = Math.min(CONFIG.MAX_FILE_LINES, Math.floor(maxTokens * CONFIG.CHARS_PER_TOKEN / 80));

    const truncated = lines.slice(0, maxLines).join("\n");
    const remaining = lines.length - maxLines;

    return `[TRUNCATED] File "${filePath}" is too large (~${estimatedTokens} tokens). Showing first ${maxLines}/${lines.length} lines.\n\n${truncated}\n\n[... ${remaining} more lines truncated. Use grep_search for targeted queries.]`;
}

/**
 * Get token budget stats for an agent.
 */
export function getTokenBudgetStats(agent: string): {
    totalTokens: number;
    recentMinute: number;
    recentHour: number;
    blocked: boolean;
    blockedRemaining: number;
    callCount: number;
} {
    const budget = agentBudgets.get(agent);
    if (!budget) {
        return { totalTokens: 0, recentMinute: 0, recentHour: 0, blocked: false, blockedRemaining: 0, callCount: 0 };
    }

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

/**
 * Get all agents' token budget stats.
 */
export function getAllTokenBudgetStats(): Record<string, {
    totalTokens: number;
    recentMinute: number;
    recentHour: number;
    blocked: boolean;
    callCount: number;
}> {
    const stats: Record<string, ReturnType<typeof getTokenBudgetStats>> = {};
    for (const [agent] of agentBudgets) {
        stats[agent] = getTokenBudgetStats(agent);
    }
    return stats;
}

/**
 * Reset all token budgets.
 */
export function resetTokenBudgets(): void {
    agentBudgets.clear();
}

export { CONFIG as TokenBudgetConfig };
