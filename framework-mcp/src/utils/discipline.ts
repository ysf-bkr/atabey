/**
 * ─── AI DISCIPLINE ENGINE ─────────────────────────────────────────
 *
 * Enforces strict rules on AI behavior at the MCP middleware layer.
 * Unlike agent instructions (which AI can ignore), these are enforced
 * at the tool level - AI cannot bypass them.
 *
 * Features:
 * - Tool call rate limiting (prevents abuse)
 * - File size limits (prevents reading/writing huge files)
 * - Call frequency tracking (detects loops)
 * - Tool blacklist per agent
 * - Agent-based tool whitelist
 * - Response content validation
 * - Max concurrent operations
 */

import fs from "fs";
import path from "path";

interface ToolCallRecord {
    tool: string;
    timestamp: number;
    argsSize: number;
}

interface AgentDiscipline {
    totalCalls: number;
    calls: ToolCallRecord[];
    lastReset: number;
    blacklistedTools: Set<string>;
    whitelistedTools: Set<string> | null; // null = no restriction
    violations: number;
    lastViolation: string | null;
}

// Per-agent discipline tracking
const agentDiscipline = new Map<string, AgentDiscipline>();

// ─── Configuration (from env or defaults) ─────────────────────────

const CONFIG = {
    MAX_CALLS_PER_MINUTE: parseInt(process.env.MCP_MAX_CALLS_PER_MINUTE || "60", 10),
    MAX_TOTAL_CALLS: parseInt(process.env.MCP_MAX_TOTAL_CALLS || "500", 10),
    MAX_FILE_SIZE: parseInt(process.env.MCP_MAX_FILE_SIZE || "1048576", 10),
    MAX_ARGS_SIZE: parseInt(process.env.MCP_MAX_ARGS_SIZE || "102400", 10),
    COOLDOWN_MS: parseInt(process.env.MCP_COOLDOWN_MS || "30000", 10),
    MAX_RESPONSE_SIZE: parseInt(process.env.MCP_MAX_RESPONSE_SIZE || "512000", 10), // 500KB max response
    MAX_CONSECUTIVE_SAME_TOOL: parseInt(process.env.MCP_MAX_CONSECUTIVE_SAME_TOOL || "10", 10),

    RESTRICTED_TOOLS: (process.env.MCP_RESTRICTED_TOOLS || "")
        .split(",").map(t => t.trim()).filter(Boolean),

    // Agent-based tool whitelist (format: agent1:tool1,tool2;agent2:tool3,tool4)
    AGENT_TOOL_WHITELIST: parseAgentWhitelist(process.env.MCP_AGENT_TOOL_WHITELIST || ""),
};

function parseAgentWhitelist(input: string): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    if (!input) return map;
    input.split(";").forEach(pair => {
        const [agent, tools] = pair.split(":");
        if (agent && tools) {
            map.set(agent.trim(), new Set(tools.split(",").map(t => t.trim())));
        }
    });
    return map;
}

const cooldowns = new Map<string, number>();

function getOrCreateAgent(agent: string): AgentDiscipline {
    if (!agentDiscipline.has(agent)) {
        const whitelist = CONFIG.AGENT_TOOL_WHITELIST.get(agent) || null;
        agentDiscipline.set(agent, {
            totalCalls: 0,
            calls: [],
            lastReset: Date.now(),
            blacklistedTools: new Set(),
            whitelistedTools: whitelist,
            violations: 0,
            lastViolation: null,
        });
    }
    return agentDiscipline.get(agent)!;
}

function pruneOldCalls(agent: AgentDiscipline, windowMs: number = 60000) {
    const cutoff = Date.now() - windowMs;
    agent.calls = agent.calls.filter(c => c.timestamp > cutoff);
}

function isInCooldown(agent: string): boolean {
    const until = cooldowns.get(agent);
    if (!until) return false;
    if (Date.now() > until) {
        cooldowns.delete(agent);
        return false;
    }
    return true;
}

function recordViolation(agent: string, reason: string): void {
    const discipline = agentDiscipline.get(agent);
    if (discipline) {
        discipline.violations++;
        discipline.lastViolation = reason;
    }
}

/**
 * Enforce discipline on a tool call before execution.
 * Returns error message if blocked, null if allowed.
 */
export async function enforceDiscipline(
    agent: string,
    toolName: string,
    args: Record<string, unknown>
): Promise<string | null> {
    const discipline = getOrCreateAgent(agent);

    // 1. Check cooldown
    if (isInCooldown(agent)) {
        const until = cooldowns.get(agent)!;
        const remaining = Math.ceil((until - Date.now()) / 1000);
        return `[DISCIPLINE] Agent ${agent} is in cooldown for ${remaining}s. Too many requests.`;
    }

    // 2. Check restricted tools (global blacklist)
    if (CONFIG.RESTRICTED_TOOLS.includes(toolName)) {
        recordViolation(agent, `Attempted to use restricted tool: ${toolName}`);
        return `[DISCIPLINE] Tool "${toolName}" is restricted. Agent ${agent} cannot use it.`;
    }

    // 3. Check agent-specific whitelist
    if (discipline.whitelistedTools && !discipline.whitelistedTools.has(toolName)) {
        recordViolation(agent, `Attempted to use non-whitelisted tool: ${toolName}`);
        const allowed = Array.from(discipline.whitelistedTools).join(", ");
        return `[DISCIPLINE] Agent ${agent} is not allowed to use "${toolName}". Allowed tools: ${allowed}`;
    }

    // 4. Check total call limit
    if (discipline.totalCalls >= CONFIG.MAX_TOTAL_CALLS) {
        cooldowns.set(agent, Date.now() + CONFIG.COOLDOWN_MS);
        recordViolation(agent, `Exceeded max total calls (${CONFIG.MAX_TOTAL_CALLS})`);
        return `[DISCIPLINE] Agent ${agent} exceeded max total calls (${CONFIG.MAX_TOTAL_CALLS}). Cooldown ${CONFIG.COOLDOWN_MS/1000}s.`;
    }

    // 5. Check rate limit (calls per minute)
    pruneOldCalls(discipline);
    if (discipline.calls.length >= CONFIG.MAX_CALLS_PER_MINUTE) {
        cooldowns.set(agent, Date.now() + CONFIG.COOLDOWN_MS);
        recordViolation(agent, `Rate limit exceeded (${CONFIG.MAX_CALLS_PER_MINUTE}/min)`);
        return `[DISCIPLINE] Agent ${agent} exceeded rate limit (${CONFIG.MAX_CALLS_PER_MINUTE}/min). Cooldown ${CONFIG.COOLDOWN_MS/1000}s.`;
    }

    // 6. Check consecutive same tool (prevents loops)
    if (discipline.calls.length >= CONFIG.MAX_CONSECUTIVE_SAME_TOOL) {
        const lastCalls = discipline.calls.slice(-CONFIG.MAX_CONSECUTIVE_SAME_TOOL);
        const allSame = lastCalls.every(c => c.tool === toolName);
        if (allSame) {
            cooldowns.set(agent, Date.now() + CONFIG.COOLDOWN_MS);
            recordViolation(agent, `Consecutive same tool limit: ${toolName} x${CONFIG.MAX_CONSECUTIVE_SAME_TOOL}`);
            return `[DISCIPLINE] Agent ${agent} called "${toolName}" ${CONFIG.MAX_CONSECUTIVE_SAME_TOOL} times in a row. Possible loop. Cooldown.`;
        }
    }

    // 7. Check args size
    const argsStr = JSON.stringify(args);
    if (argsStr.length > CONFIG.MAX_ARGS_SIZE) {
        recordViolation(agent, `Args too large: ${argsStr.length} bytes`);
        return `[DISCIPLINE] Tool call args too large (${argsStr.length} bytes, max: ${CONFIG.MAX_ARGS_SIZE}).`;
    }

    // 8. Check file size for read/write operations
    if ((toolName === "read_file" || toolName === "write_file") && args.path) {
        try {
            const projectRoot = process.env.ATABEY_PROJECT_ROOT || process.cwd();
            const filePath = path.resolve(projectRoot, args.path as string);
            if (fs.existsSync(filePath)) {
                const stat = fs.statSync(filePath);
                if (stat.size > CONFIG.MAX_FILE_SIZE) {
                    return `[DISCIPLINE] File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB, max: ${(CONFIG.MAX_FILE_SIZE / 1024 / 1024).toFixed(1)}MB). Use grep_search instead.`;
                }
            }
        } catch { /* ignore */ }
    }

    // Record the call
    discipline.totalCalls++;
    discipline.calls.push({
        tool: toolName,
        timestamp: Date.now(),
        argsSize: argsStr.length,
    });

    return null;
}

/**
 * Validate tool response content before returning to AI.
 * Returns error message if blocked, null if allowed.
 */
export function validateResponse(toolName: string, result: { content: Array<{ type: string; text: string }> }): string | null {
    if (!result || !result.content) return null;

    for (const block of result.content) {
        if (block.type !== "text" || !block.text) continue;

        // Check response size
        if (block.text.length > CONFIG.MAX_RESPONSE_SIZE) {
            return `[DISCIPLINE] Response too large (${(block.text.length / 1024).toFixed(1)}KB, max: ${(CONFIG.MAX_RESPONSE_SIZE / 1024).toFixed(1)}KB).`;
        }

        // Block binary/gibberish content in text responses
        const nonPrintable = (block.text.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
        if (nonPrintable > block.text.length * 0.3) {
            return `[DISCIPLINE] Response contains too much binary data (${nonPrintable} non-printable chars). Blocked.`;
        }
    }

    return null;
}

/**
 * Get discipline stats for an agent.
 */
export function getDisciplineStats(agent: string): {
    totalCalls: number;
    recentCalls: number;
    inCooldown: boolean;
    cooldownRemaining: number;
    violations: number;
    lastViolation: string | null;
} {
    const discipline = agentDiscipline.get(agent);
    if (!discipline) {
        return { totalCalls: 0, recentCalls: 0, inCooldown: false, cooldownRemaining: 0, violations: 0, lastViolation: null };
    }

    pruneOldCalls(discipline);
    const cooldownUntil = cooldowns.get(agent);

    return {
        totalCalls: discipline.totalCalls,
        recentCalls: discipline.calls.length,
        inCooldown: isInCooldown(agent),
        cooldownRemaining: cooldownUntil ? Math.max(0, cooldownUntil - Date.now()) : 0,
        violations: discipline.violations,
        lastViolation: discipline.lastViolation,
    };
}

/**
 * Get all agents' discipline stats.
 */
export function getAllDisciplineStats(): Record<string, {
    totalCalls: number;
    recentCalls: number;
    inCooldown: boolean;
    violations: number;
    lastViolation: string | null;
}> {
    const stats: Record<string, ReturnType<typeof getDisciplineStats>> = {};
    for (const [agent, _discipline] of agentDiscipline) {
        stats[agent] = getDisciplineStats(agent);
    }
    return stats;
}

/**
 * Reset discipline for all agents.
 */
export function resetDiscipline(): void {
    agentDiscipline.clear();
    cooldowns.clear();
}

export { CONFIG as DisciplineConfig };
