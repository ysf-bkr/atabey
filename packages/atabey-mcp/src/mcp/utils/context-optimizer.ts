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

import crypto from "crypto";
import fs from "fs";
import path from "path";

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
    "claude":   { maxContextTokens: 200000, maxResponseTokens: 8192,  maxTokensPerMinute: 100000, maxTokensPerHour: 500000, maxFileReadSize: 204800, maxFileLines: 400,  charsPerToken: 3.5, maxToolCallsPerMinute: 60 },
    "cursor":   { maxContextTokens: 100000, maxResponseTokens: 4096,  maxTokensPerMinute: 50000,  maxTokensPerHour: 250000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 30 },
    "gemini":   { maxContextTokens: 1000000, maxResponseTokens: 32768, maxTokensPerMinute: 500000, maxTokensPerHour: 2000000, maxFileReadSize: 512000, maxFileLines: 1000, charsPerToken: 3,   maxToolCallsPerMinute: 120 },
    "vscode":   { maxContextTokens: 64000,  maxResponseTokens: 4096,  maxTokensPerMinute: 30000,  maxTokensPerHour: 150000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 20 },
    "copilot":  { maxContextTokens: 64000,  maxResponseTokens: 4096,  maxTokensPerMinute: 30000,  maxTokensPerHour: 150000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 20 },
    "default":  { maxContextTokens: 100000, maxResponseTokens: 4000,  maxTokensPerMinute: 20000,  maxTokensPerHour: 100000, maxFileReadSize: 102400, maxFileLines: 200,  charsPerToken: 4,   maxToolCallsPerMinute: 30 },
};

// ─── Environment Overrides ────────────────────────────────────────

function getProviderLimits(provider: string): ProviderLimits {
    const base = PROVIDER_LIMITS[provider] || PROVIDER_LIMITS["default"];
    return {
        maxContextTokens: parseInt(process.env.MCP_MAX_CONTEXT_TOKENS || String(base.maxContextTokens), 10),
        maxResponseTokens: parseInt(process.env.MCP_MAX_RESPONSE_TOKENS || String(base.maxResponseTokens), 10),
        maxTokensPerMinute: parseInt(process.env.MCP_MAX_TOKENS_PER_MINUTE || String(base.maxTokensPerMinute), 10),
        maxTokensPerHour: parseInt(process.env.MCP_MAX_TOKENS_PER_HOUR || String(base.maxTokensPerHour), 10),
        maxFileReadSize: parseInt(process.env.MCP_MAX_FILE_READ_SIZE || String(base.maxFileReadSize), 10),
        maxFileLines: parseInt(process.env.MCP_MAX_FILE_LINES || String(base.maxFileLines), 10),
        charsPerToken: parseFloat(process.env.MCP_CHARS_PER_TOKEN || String(base.charsPerToken)),
        maxToolCallsPerMinute: parseInt(process.env.MCP_MAX_TOOL_CALLS_PER_MINUTE || String(base.maxToolCallsPerMinute), 10),
    };
}

// ─── Context Window Manager ───────────────────────────────────────

interface ContextBlock {
    id: string;
    type: "file" | "task" | "result" | "error" | "system" | "memory";
    content: string;
    tokens: number;
    priority: number;  // 1-10, 10=highest
    timestamp: number;
    ttl: number | null; // ms, null=forever
}

interface ContextSession {
    agent: string;
    blocks: ContextBlock[];
    totalTokens: number;
    lastAccess: number;
    createdAt: number;
}

const sessions = new Map<string, ContextSession>();
const TOOL_CALL_RECORDS = new Map<string, number[]>();

/**
 * Detect provider from environment or client name.
 */
export function detectProvider(clientName: string): string {
    const name = clientName.toLowerCase();
    if (name.includes("claude")) return "claude";
    if (name.includes("cursor")) return "cursor";
    if (name.includes("gemini")) return "gemini";
    if (name.includes("vscode") || name.includes("visual studio")) return "vscode";
    if (name.includes("copilot") || name.includes("github")) return "copilot";
    return process.env.MCP_PROVIDER || "default";
}

/**
 * Estimate token count from text (provider-aware).
 */
export function estimateTokens(text: string, provider: string = "default"): number {
    if (!text) return 0;
    const limits = getProviderLimits(provider);
    return Math.ceil(text.length / limits.charsPerToken);
}

// ─── Context Window Management ────────────────────────────────────

/**
 * Get or create a context session for an agent.
 */
function getSession(agent: string): ContextSession {
    if (!sessions.has(agent)) {
        sessions.set(agent, { agent, blocks: [], totalTokens: 0, lastAccess: Date.now(), createdAt: Date.now() });
    }
    const session = sessions.get(agent)!;
    session.lastAccess = Date.now();
    return session;
}

/**
 * Add a block to the agent's context window.
 * Automatically evicts low-priority blocks when context is full.
 */
export function addContextBlock(
    agent: string,
    type: ContextBlock["type"],
    content: string,
    priority: number = 5,
    ttl: number | null = null
): { added: boolean; evicted: string[] } {
    const session = getSession(agent);
    const provider = detectProvider(agent);
    const limits = getProviderLimits(provider);
    const tokens = estimateTokens(content, provider);
    const evicted: string[] = [];

    const block: ContextBlock = {
        id: crypto.randomBytes(4).toString("hex"),
        type,
        content,
        tokens,
        priority,
        timestamp: Date.now(),
        ttl,
    };

    // If this single block exceeds context, truncate it
    if (tokens > limits.maxContextTokens * 0.5) {
        const ratio = limits.maxContextTokens * 0.5 / tokens;
        const maxChars = Math.floor(content.length * ratio);
        block.content = content.substring(0, maxChars) + `\n[... TRUNCATED: ${content.length - maxChars} chars, ${tokens - Math.floor(maxChars / limits.charsPerToken)} tokens]`;
        block.tokens = estimateTokens(block.content, provider);
    }

    // Evict low-priority or expired blocks if needed
    const available = limits.maxContextTokens - session.totalTokens;
    if (block.tokens > available) {
        // Sort blocks by priority (asc), then by TTL (expired first)
        const sorted = [...session.blocks].sort((a, b) => {
            if (a.priority !== b.priority) return a.priority - b.priority;
            if (a.ttl && Date.now() - a.timestamp > a.ttl) return -1;
            if (b.ttl && Date.now() - b.timestamp > b.ttl) return 1;
            return a.timestamp - b.timestamp;
        });

        let freed = available;
        for (const blk of sorted) {
            if (freed >= block.tokens) break;
            if (blk.priority >= block.priority && blk.type !== "system") continue; // Don't evict same/higher priority
            session.totalTokens -= blk.tokens;
            session.blocks = session.blocks.filter(b => b.id !== blk.id);
            freed += blk.tokens;
            evicted.push(blk.type);
        }
    }

    // Add block
    session.blocks.push(block);
    session.totalTokens += block.tokens;

    // Remove expired TTL blocks
    session.blocks = session.blocks.filter(b => !b.ttl || Date.now() - b.timestamp < b.ttl);
    session.totalTokens = session.blocks.reduce((sum, b) => sum + b.tokens, 0);

    return { added: true, evicted };
}

/**
 * Get current context usage stats.
 */
export function getContextStats(agent: string): {
    totalTokens: number;
    maxTokens: number;
    usagePercent: number;
    blockCount: number;
    blocks: Array<{ type: string; tokens: number; priority: number }>;
} {
    const provider = detectProvider(agent);
    const limits = getProviderLimits(provider);
    const session = sessions.get(agent);

    if (!session) {
        return { totalTokens: 0, maxTokens: limits.maxContextTokens, usagePercent: 0, blockCount: 0, blocks: [] };
    }

    return {
        totalTokens: session.totalTokens,
        maxTokens: limits.maxContextTokens,
        usagePercent: Math.round(session.totalTokens / limits.maxContextTokens * 100),
        blockCount: session.blocks.length,
        blocks: session.blocks.map(b => ({ type: b.type, tokens: b.tokens, priority: b.priority })),
    };
}

/**
 * Compress context by summarizing low-priority blocks.
 */
export function compressContext(agent: string, targetPercent: number = 70): { compressed: number; summary: string } {
    const session = getSession(agent);
    const limits = getProviderLimits(detectProvider(agent));
    const targetTokens = Math.floor(limits.maxContextTokens * targetPercent / 100);

    if (session.totalTokens <= targetTokens) {
        return { compressed: 0, summary: "Context within limits. No compression needed." };
    }

    const excess = session.totalTokens - targetTokens;
    let compressed = 0;

    // Compress low-priority blocks first
    const sorted = [...session.blocks].sort((a, b) => a.priority - b.priority);
    for (const block of sorted) {
        if (compressed >= excess) break;
        if (block.type === "system") continue; // Never compress system blocks

        const originalTokens = block.tokens;
        const summaryLength = Math.max(100, Math.floor(block.content.length * 0.3));
        block.content = "[COMPRESSED] " + block.content.substring(0, summaryLength) + `[... (original: ${originalTokens} tokens)]`;
        block.tokens = estimateTokens(block.content, detectProvider(agent));
        compressed += originalTokens - block.tokens;
    }

    session.totalTokens = session.blocks.reduce((sum, b) => sum + b.tokens, 0);
    return { compressed, summary: `Compressed ${compressed} tokens. Current: ${session.totalTokens}/${limits.maxContextTokens} (${Math.round(session.totalTokens / limits.maxContextTokens * 100)}%)` };
}

/**
 * Persist session to disk for recovery after disconnect.
 */
export function persistSession(agent: string): void {
    const session = sessions.get(agent);
    if (!session) return;

    const persistDir = path.join(process.cwd(), ".atabey", "context-sessions");
    if (!fs.existsSync(persistDir)) fs.mkdirSync(persistDir, { recursive: true });

    const filePath = path.join(persistDir, `${agent.replace(/[^a-z0-9]/gi, "_")}.json`);
    fs.writeFileSync(filePath, JSON.stringify({
        agent: session.agent,
        blocks: session.blocks.map(b => ({ type: b.type, content: b.content, priority: b.priority, timestamp: b.timestamp })),
        totalTokens: session.totalTokens,
        createdAt: session.createdAt,
    }, null, 2));
}

/**
 * Restore session from disk.
 */
export function restoreSession(agent: string): boolean {
    const persistDir = path.join(process.cwd(), ".atabey", "context-sessions");
    const filePath = path.join(persistDir, `${agent.replace(/[^a-z0-9]/gi, "_")}.json`);

    if (!fs.existsSync(filePath)) return false;

    try {
        const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
        const session = getSession(agent);
        session.blocks = data.blocks.map((b: ContextBlock) => ({
            ...b,
            id: crypto.randomBytes(4).toString("hex"),
            tokens: estimateTokens(b.content, detectProvider(agent)),
            ttl: null,
        }));
        session.totalTokens = session.blocks.reduce((sum: number, b: ContextBlock) => sum + b.tokens, 0);
        return true;
    } catch {
        return false;
    }
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

    // 5. Context window warning
    const contextStats = getContextStats(agent);
    if (contextStats.usagePercent > 90) {
        process.stderr.write(`[CONTEXT WARNING] ${agent} at ${contextStats.usagePercent}% of ${resolvedProvider} context window (${contextStats.totalTokens}/${contextStats.maxTokens}). Consider compressContext().\n`);
    }

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

export function resetTokenBudgets(): void { agentBudgets.clear(); sessions.clear(); TOOL_CALL_RECORDS.clear(); }

export function updateTokenBudgetConfig(_newConfig: Record<string, number>): void { /* handled by env vars */ }

export function getTokenBudgetConfig() { return { ...PROVIDER_LIMITS }; }
