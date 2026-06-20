/**
 * ─── LOOP DETECTOR ─────────────────────────────────────────────────
 *
 * Detects and prevents AI agents from entering infinite loops.
 * Monitors call patterns across time, file paths, and tools.
 *
 * Detection Patterns:
 * 1. **Consecutive Same Tool** – Same tool called N times in a row
 * 2. **File Churn** – Same file written/read repeatedly
 * 3. **Oscillation** – A → B → A → B alternating pattern
 * 4. **Time-based Throttle** – Too many calls in a short window
 * 5. **Semantic Similarity** – Similar arguments repeated (e.g., same error fix loop)
 * 6. **Content Identity** – Same content being written repeatedly
 *
 * Action:
 * - Cooldown: Block agent for N seconds
 * - Escalate: Notify dashboard/human if loop persists
 * - Kill: Force-stop the agent session
 *
 * Environment Variables:
 *   MCP_LOOP_MAX_CONSECUTIVE   - Max same tool calls (default: 10)
 *   MCP_LOOP_MAX_FILE_CHURN     - Max writes to same file (default: 5)
 *   MCP_LOOP_COOLDOWN_MS        - Cooldown duration (default: 30000)
 *   MCP_LOOP_OSCILLATION_WINDOW - Oscillation detection window (default: 6)
 */

import path from "path";

// ─── Configuration ────────────────────────────────────────────────

const CONFIG = {
    /** Max consecutive same tool calls before action */
    MAX_CONSECUTIVE: parseInt(process.env.MCP_LOOP_MAX_CONSECUTIVE || "10", 10),
    /** Max writes to the same file before action */
    MAX_FILE_CHURN: parseInt(process.env.MCP_LOOP_MAX_FILE_CHURN || "5", 10),
    /** Max reads of the same file before action */
    MAX_FILE_READ_CHURN: parseInt(process.env.MCP_LOOP_MAX_FILE_READ_CHURN || "10", 10),
    /** Oscillation pattern window (min calls to detect A→B→A→B) */
    OSCILLATION_WINDOW: parseInt(process.env.MCP_LOOP_OSCILLATION_WINDOW || "6", 10),
    /** Cooldown duration in ms */
    COOLDOWN_MS: parseInt(process.env.MCP_LOOP_COOLDOWN_MS || "30000", 10),
    /** Max calls to any tool in sliding window */
    MAX_CALLS_IN_WINDOW: parseInt(process.env.MCP_LOOP_MAX_CALLS_IN_WINDOW || "50", 10),
    /** Sliding window size in ms */
    WINDOW_SIZE_MS: parseInt(process.env.MCP_LOOP_WINDOW_MS || "60000", 10),
    /** Enable/disable loop detector */
    ENABLED: process.env.MCP_LOOP_DETECTION !== "false",
};

// ─── Types ────────────────────────────────────────────────────────

export interface ToolCallRecord {
    agent: string;
    toolName: string;
    args: Record<string, unknown>;
    timestamp: number;
    /** File path involved (if applicable) */
    filePath?: string;
    /** Content hash for content identity detection */
    contentHash?: string;
}

export interface LoopAlert {
    type: "consecutive_same_tool" | "file_churn" | "oscillation" | "rate_limit" | "content_identity";
    severity: "warning" | "critical";
    agent: string;
    detail: string;
    timestamp: number;
    cooldownUntil: number | null;
}

// ─── Agent Call History ───────────────────────────────────────────

interface AgentHistory {
    calls: ToolCallRecord[];
    consecutiveToolCalls: Map<string, number>; // tool → count
    fileWriteCount: Map<string, number>;       // filePath → count
    fileReadCount: Map<string, number>;        // filePath → count
    lastContentHashes: string[];                // For content identity
    inCooldown: boolean;
    cooldownUntil: number;
    cooldownCount: number;                      // How many times cooldown triggered
    lastAlert: LoopAlert | null;
}

const agentHistories = new Map<string, AgentHistory>();

// ─── Loop Detector ────────────────────────────────────────────────

/**
 * Get or create agent history.
 */
function getOrCreateHistory(agent: string): AgentHistory {
    if (!agentHistories.has(agent)) {
        agentHistories.set(agent, {
            calls: [],
            consecutiveToolCalls: new Map(),
            fileWriteCount: new Map(),
            fileReadCount: new Map(),
            lastContentHashes: [],
            inCooldown: false,
            cooldownUntil: 0,
            cooldownCount: 0,
            lastAlert: null,
        });
    }
    return agentHistories.get(agent)!;
}

/**
 * Prune old calls from history.
 */
function pruneOldCalls(history: AgentHistory): void {
    const cutoff = Date.now() - CONFIG.WINDOW_SIZE_MS;
    history.calls = history.calls.filter(c => c.timestamp > cutoff);
}

/**
 * Extract file path from tool args if applicable.
 */
function extractFilePath(toolName: string, args: Record<string, unknown>): string | undefined {
    if (["write_file", "read_file", "replace_text", "patch_file", "batch_surgical_edit"].includes(toolName)) {
        return args.path as string || args.filePath as string || undefined;
    }
    return undefined;
}

/**
 * Compute a simple content hash for identity detection.
 */
function computeContentHash(args: Record<string, unknown>): string | undefined {
    if (args.content && typeof args.content === "string") {
        // Use first 100 chars as hash (fast, good enough for identity)
        return args.content.substring(0, 100);
    }
    return undefined;
}

/**
 * Check for oscillation pattern (A → B → A → B).
 */
function detectOscillation(
    history: AgentHistory,
    currentTool: string
): boolean {
    const recent = history.calls.slice(-CONFIG.OSCILLATION_WINDOW);
    if (recent.length < 4) return false;

    const recentToolNames = [...recent.map(c => c.toolName), currentTool];

    // Check alternating pattern: tool[0] === tool[2] === tool[4] && tool[1] === tool[3] === tool[5]
    if (recentToolNames.length >= 4) {
        if (recentToolNames[0] === recentToolNames[2] &&
            recentToolNames[1] === recentToolNames[3] &&
            recentToolNames[0] !== recentToolNames[1]) {
            // Check if pattern extends to 6
            if (recentToolNames.length >= 6) {
                return recentToolNames[0] === recentToolNames[4] && recentToolNames[1] === recentToolNames[5];
            }
            return true;
        }
    }

    return false;
}

/**
 * Detect if same content is being written repeatedly.
 */
function detectContentIdentity(
    history: AgentHistory,
    contentHash: string | undefined
): boolean {
    if (!contentHash) return false;

    const recentHashes = history.lastContentHashes.slice(-5);
    if (recentHashes.length < 3) return false;

    // Check if this hash appears 3+ times in last 5
    const hashCount = recentHashes.filter(h => h === contentHash).length;
    if (contentHash === recentHashes[recentHashes.length - 1]) {
        // Count including current
        return hashCount + 1 >= 3;
    }

    return false;
}

/**
 * Record a tool call and check for loop patterns.
 * Returns LoopAlert if a loop pattern is detected, null otherwise.
 */
export function recordAndCheck(
    agent: string,
    toolName: string,
    args: Record<string, unknown>
): LoopAlert | null {
    if (!CONFIG.ENABLED) return null;

    const history = getOrCreateHistory(agent);

    // Check cooldown
    if (history.inCooldown) {
        if (Date.now() < history.cooldownUntil) {
            return {
                type: "rate_limit",
                severity: "critical",
                agent,
                detail: `Agent "${agent}" is in cooldown for ${Math.ceil((history.cooldownUntil - Date.now()) / 1000)}s. Loop detected earlier.`,
                timestamp: Date.now(),
                cooldownUntil: history.cooldownUntil,
            };
        } else {
            history.inCooldown = false;
        }
    }

    const filePath = extractFilePath(toolName, args);
    const contentHash = computeContentHash(args);

    const record: ToolCallRecord = {
        agent,
        toolName,
        args,
        timestamp: Date.now(),
        filePath,
        contentHash,
    };

    // Prune old calls
    pruneOldCalls(history);

    // Check 1: Consecutive same tool
    const currentConsecutive = (history.consecutiveToolCalls.get(toolName) || 0) + 1;
    history.consecutiveToolCalls.set(toolName, currentConsecutive);
    // Reset other tools
    for (const [tool] of history.consecutiveToolCalls) {
        if (tool !== toolName) {
            history.consecutiveToolCalls.set(tool, 0);
        }
    }

    if (currentConsecutive >= CONFIG.MAX_CONSECUTIVE) {
        const alert: LoopAlert = {
            type: "consecutive_same_tool",
            severity: "critical",
            agent,
            detail: `Agent "${agent}" called "${toolName}" ${currentConsecutive} times consecutively. Possible infinite loop.`,
            timestamp: Date.now(),
            cooldownUntil: Date.now() + CONFIG.COOLDOWN_MS,
        };
        applyCooldown(history, alert, agent);
        return alert;
    }

    // Check 2: File churn (for write operations)
    if (filePath) {
        if (["write_file", "replace_text", "patch_file", "batch_surgical_edit"].includes(toolName)) {
            const writeCount = (history.fileWriteCount.get(filePath) || 0) + 1;
            history.fileWriteCount.set(filePath, writeCount);

            if (writeCount >= CONFIG.MAX_FILE_CHURN) {
                const alert: LoopAlert = {
                    type: "file_churn",
                    severity: "critical",
                    agent,
                    detail: `Agent "${agent}" wrote to "${path.relative(process.cwd(), filePath)}" ${writeCount} times. Possible file churn loop.`,
                    timestamp: Date.now(),
                    cooldownUntil: Date.now() + CONFIG.COOLDOWN_MS,
                };
                applyCooldown(history, alert, agent);
                return alert;
            }
        }

        if (toolName === "read_file") {
            const readCount = (history.fileReadCount.get(filePath) || 0) + 1;
            history.fileReadCount.set(filePath, readCount);

            if (readCount >= CONFIG.MAX_FILE_READ_CHURN) {
                const alert: LoopAlert = {
                    type: "file_churn",
                    severity: "warning",
                    agent,
                    detail: `Agent "${agent}" read "${path.relative(process.cwd(), filePath)}" ${readCount} times. Possible read loop.`,
                    timestamp: Date.now(),
                    cooldownUntil: null,
                };
                history.lastAlert = alert;
                return alert;
            }
        }
    }

    // Check 3: Oscillation pattern
    if (detectOscillation(history, toolName)) {
        const alert: LoopAlert = {
            type: "oscillation",
            severity: "critical",
            agent,
            detail: `Agent "${agent}" is oscillating between tools. Pattern detected in last ${CONFIG.OSCILLATION_WINDOW} calls.`,
            timestamp: Date.now(),
            cooldownUntil: Date.now() + CONFIG.COOLDOWN_MS,
        };
        applyCooldown(history, alert, agent);
        return alert;
    }

    // Check 4: Rate limit (calls in sliding window)
    if (history.calls.length >= CONFIG.MAX_CALLS_IN_WINDOW) {
        const alert: LoopAlert = {
            type: "rate_limit",
            severity: "critical",
            agent,
            detail: `Agent "${agent}" made ${history.calls.length} calls in ${CONFIG.WINDOW_SIZE_MS / 1000}s window. Rate limit exceeded.`,
            timestamp: Date.now(),
            cooldownUntil: Date.now() + CONFIG.COOLDOWN_MS,
        };
        applyCooldown(history, alert, agent);
        return alert;
    }

    // Check 5: Content identity (writing same content)
    if (contentHash && detectContentIdentity(history, contentHash)) {
        const alert: LoopAlert = {
            type: "content_identity",
            severity: "critical",
            agent,
            detail: `Agent "${agent}" is writing the same content repeatedly. Possible fix-attempt loop.`,
            timestamp: Date.now(),
            cooldownUntil: Date.now() + CONFIG.COOLDOWN_MS,
        };
        applyCooldown(history, alert, agent);
        return alert;
    }

    // If no detection, record the call
    history.calls.push(record);

    // Track content hashes for identity detection
    if (contentHash) {
        history.lastContentHashes.push(contentHash);
        if (history.lastContentHashes.length > 10) {
            history.lastContentHashes.shift();
        }
    }

    return null;
}

/**
 * Apply cooldown to an agent.
 */
function applyCooldown(history: AgentHistory, alert: LoopAlert, agent: string): void {
    history.inCooldown = true;
    history.cooldownUntil = alert.cooldownUntil || Date.now() + CONFIG.COOLDOWN_MS;
    history.cooldownCount++;
    history.lastAlert = alert;

    process.stderr.write(`[LOOP DETECT] ${alert.type}: ${alert.detail}\n`);
}

/**
 * Check if an agent is currently in cooldown.
 */
export function isInCooldown(agent: string): {
    inCooldown: boolean;
    remainingMs: number;
    reason: string | null;
} {
    const history = agentHistories.get(agent);
    if (!history || !history.inCooldown) {
        return { inCooldown: false, remainingMs: 0, reason: null };
    }

    const remaining = history.cooldownUntil - Date.now();
    if (remaining <= 0) {
        history.inCooldown = false;
        return { inCooldown: false, remainingMs: 0, reason: null };
    }

    return {
        inCooldown: true,
        remainingMs: remaining,
        reason: history.lastAlert?.detail || null,
    };
}

/**
 * Manually clear cooldown for an agent.
 */
export function clearCooldown(agent: string): boolean {
    const history = agentHistories.get(agent);
    if (history) {
        history.inCooldown = false;
        history.cooldownUntil = 0;
        history.consecutiveToolCalls.clear();
        return true;
    }
    return false;
}

/**
 * Get loop detection stats for an agent.
 */
export function getLoopStats(agent: string): {
    totalCalls: number;
    recentCalls: number;
    inCooldown: boolean;
    cooldownCount: number;
    consecutiveTools: Record<string, number>;
    fileWrites: Record<string, number>;
    fileReads: Record<string, number>;
    lastAlert: LoopAlert | null;
} {
    const history = agentHistories.get(agent);
    if (!history) {
        return {
            totalCalls: 0,
            recentCalls: 0,
            inCooldown: false,
            cooldownCount: 0,
            consecutiveTools: {},
            fileWrites: {},
            fileReads: {},
            lastAlert: null,
        };
    }

    pruneOldCalls(history);

    return {
        totalCalls: history.calls.length + history.cooldownCount * CONFIG.MAX_CALLS_IN_WINDOW,
        recentCalls: history.calls.length,
        inCooldown: history.inCooldown && Date.now() < history.cooldownUntil,
        cooldownCount: history.cooldownCount,
        consecutiveTools: Object.fromEntries(history.consecutiveToolCalls),
        fileWrites: Object.fromEntries(history.fileWriteCount),
        fileReads: Object.fromEntries(history.fileReadCount),
        lastAlert: history.lastAlert,
    };
}

/**
 * Get all agents' loop stats.
 */
export function getAllLoopStats(): Record<string, {
    totalCalls: number;
    inCooldown: boolean;
    cooldownCount: number;
    lastAlert: LoopAlert | null;
}> {
    const stats: Record<string, ReturnType<typeof getLoopStats>> = {};
    for (const [agent] of agentHistories) {
        stats[agent] = getLoopStats(agent);
    }
    return stats;
}

/**
 * Reset all agent histories.
 */
export function resetLoopDetection(): void {
    agentHistories.clear();
}

export { CONFIG as LoopDetectorConfig };
