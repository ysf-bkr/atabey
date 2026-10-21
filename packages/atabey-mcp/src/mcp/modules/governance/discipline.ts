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
import { AtabeyStorage } from "atabey-shared/storage.js";
import { logger } from "../../../shared/logger.js";

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
    lastGrepAt: number; // timestamp of the last grep_search (token-economy gate)
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

    // Token-economy: require a recent grep_search before a blind full-file read
    READ_DISCIPLINE_ENFORCE: ["1", "true", "yes", "on"].includes(
        (process.env.ATABEY_DISCIPLINE_ENFORCE_READ || "").toLowerCase()
    ),
    READ_DISCIPLINE_LINES: parseInt(process.env.MCP_READ_DISCIPLINE_LINES || "400", 10),
    GREP_RECENCY_MS: parseInt(process.env.MCP_GREP_RECENCY_MS || "300000", 10),

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

function setCooldown(agent: string, durationMs: number): void {
    const until = Date.now() + durationMs;
    cooldowns.set(agent, until);

    const discipline = getOrCreateAgent(agent);
    try {
        AtabeyStorage.saveDiscipline(agent, {
            totalCalls: discipline.totalCalls,
            violations: discipline.violations,
            lastViolation: discipline.lastViolation,
            cooldownUntil: until
        });
    } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
}

function getOrCreateAgent(agent: string): AgentDiscipline {
    if (!agentDiscipline.has(agent)) {
        const whitelist = CONFIG.AGENT_TOOL_WHITELIST.get(agent) || null;
        const record: AgentDiscipline = {
            totalCalls: 0,
            calls: [],
            lastReset: Date.now(),
            blacklistedTools: new Set(),
            whitelistedTools: whitelist,
            violations: 0,
            lastViolation: null,
            lastGrepAt: 0,
        };

        // Try to restore from database
        try {
            const dbState = AtabeyStorage.getDiscipline(agent);
            if (dbState) {
                record.totalCalls = dbState.totalCalls;
                record.violations = dbState.violations;
                record.lastViolation = dbState.lastViolation;
                
                if (dbState.cooldownUntil > Date.now()) {
                    cooldowns.set(agent, dbState.cooldownUntil);
                }
            }
        } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }

        // Restore recent call history from SQLite (restart-durable rate limiting).
        // Keep the last hour so the 60s/minute window survives a restart.
        try {
            const since = Date.now() - 3600000;
            const recent = AtabeyStorage.getRecentDisciplineCalls(agent, since);
            if (recent.length > 0) {
                record.calls = recent.map(c => ({ tool: c.tool, timestamp: c.timestamp, argsSize: c.argsSize }));
            }
            AtabeyStorage.pruneDisciplineCalls(since);
        } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }

        agentDiscipline.set(agent, record);
    }
    return agentDiscipline.get(agent)!;
}

function pruneOldCalls(agent: AgentDiscipline, windowMs: number = 60000) {
    const cutoff = Date.now() - windowMs;
    agent.calls = agent.calls.filter(c => c.timestamp > cutoff);
}

function isInCooldown(agent: string): boolean {
    // Prefer in-memory; hydrate from SQLite if process restarted
    let until = cooldowns.get(agent);
    if (!until) {
        try {
            const dbState = AtabeyStorage.getDiscipline(agent);
            if (dbState && dbState.cooldownUntil > Date.now()) {
                cooldowns.set(agent, dbState.cooldownUntil);
                until = dbState.cooldownUntil;
            }
        } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
    }
    if (!until) return false;
    if (Date.now() > until) {
        cooldowns.delete(agent);
        // Clear durable cooldown so restart does not re-apply expired state
        try {
            const discipline = agentDiscipline.get(agent);
            AtabeyStorage.saveDiscipline(agent, {
                totalCalls: discipline?.totalCalls ?? 0,
                violations: discipline?.violations ?? 0,
                lastViolation: discipline?.lastViolation ?? null,
                cooldownUntil: 0,
            });
        } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
        return false;
    }
    return true;
}

function recordViolation(agent: string, reason: string): void {
    const discipline = agentDiscipline.get(agent);
    if (discipline) {
        discipline.violations++;
        discipline.lastViolation = reason;

        try {
            const cooldownUntil = cooldowns.get(agent) || 0;
            AtabeyStorage.saveDiscipline(agent, {
                totalCalls: discipline.totalCalls,
                violations: discipline.violations,
                lastViolation: discipline.lastViolation,
                cooldownUntil
            });
        } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
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

    // Track grep_search recency for the token-economy read gate.
    if (toolName === "grep_search") {
        discipline.lastGrepAt = Date.now();
    }

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
        setCooldown(agent, CONFIG.COOLDOWN_MS);
        recordViolation(agent, `Exceeded max total calls (${CONFIG.MAX_TOTAL_CALLS})`);
        return `[DISCIPLINE] Agent ${agent} exceeded max total calls (${CONFIG.MAX_TOTAL_CALLS}). Cooldown ${CONFIG.COOLDOWN_MS/1000}s.`;
    }

    // 5. Check rate limit (calls per minute)
    pruneOldCalls(discipline);
    if (discipline.calls.length >= CONFIG.MAX_CALLS_PER_MINUTE) {
        setCooldown(agent, CONFIG.COOLDOWN_MS);
        recordViolation(agent, `Rate limit exceeded (${CONFIG.MAX_CALLS_PER_MINUTE}/min)`);
        return `[DISCIPLINE] Agent ${agent} exceeded rate limit (${CONFIG.MAX_CALLS_PER_MINUTE}/min). Cooldown ${CONFIG.COOLDOWN_MS/1000}s.`;
    }

    // 6. Check consecutive same tool (prevents loops)
    if (discipline.calls.length >= CONFIG.MAX_CONSECUTIVE_SAME_TOOL) {
        const lastCalls = discipline.calls.slice(-CONFIG.MAX_CONSECUTIVE_SAME_TOOL);
        const allSame = lastCalls.every(c => c.tool === toolName);
        if (allSame) {
            setCooldown(agent, CONFIG.COOLDOWN_MS);
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
        } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
    }

    // 9. Token-economy: discourage blind full-file reads (grep first)
    if (CONFIG.READ_DISCIPLINE_ENFORCE && toolName === "read_file") {
        const hasRange = typeof args.startLine === "number" || typeof args.endLine === "number";
        const pathArg = typeof args.path === "string" ? args.path : "";
        if (!hasRange && pathArg) {
            try {
                const projectRoot = process.env.ATABEY_PROJECT_ROOT || process.cwd();
                const filePath = path.resolve(projectRoot, pathArg);
                if (fs.existsSync(filePath)) {
                    const lineCount = fs.readFileSync(filePath, "utf8").split("\n").length;
                    const recentlySearched = Date.now() - discipline.lastGrepAt < CONFIG.GREP_RECENCY_MS;
                    if (lineCount > CONFIG.READ_DISCIPLINE_LINES && !recentlySearched) {
                        recordViolation(agent, `Blind full-file read: ${pathArg} (${lineCount} lines)`);
                        return `[DISCIPLINE][TOKEN ECONOMY] "${pathArg}" is ${lineCount} lines. Run 'grep_search' first, or read a line range (startLine/endLine), to avoid wasting tokens.`;
                    }
                }
            } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
        }
    }

    // Record the call
    discipline.totalCalls++;
    discipline.calls.push({
        tool: toolName,
        timestamp: Date.now(),
        argsSize: argsStr.length,
    });

    // Persist the call event for restart-durable rate limiting.
    try {
        AtabeyStorage.recordDisciplineCall(agent, toolName, Date.now(), argsStr.length);
    } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }

    try {
        const cooldownUntil = cooldowns.get(agent) || 0;
        AtabeyStorage.saveDiscipline(agent, {
            totalCalls: discipline.totalCalls,
            violations: discipline.violations,
            lastViolation: discipline.lastViolation,
            cooldownUntil
        });
    } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }

    return null;
}

// ─── Prompt Injection Patterns ─────────────────────────────────────────────
// Common adversarial patterns that attempt to override agent instructions.
// These are checked in tool responses to prevent exfiltrated injection payloads
// (e.g. from malicious file content, API responses, or external user input)
// from reaching the AI and overriding the system prompt.
const PROMPT_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /ignore\s+(previous|prior|above|all)\s+instructions?/i,            label: "ignore-instructions" },
    { pattern: /disregard\s+(previous|prior|above|all)\s+instructions?/i,         label: "disregard-instructions" },
    { pattern: /forget\s+(everything|all|prior|previous)/i,                        label: "forget-prior" },
    { pattern: /you\s+are\s+now\s+(a|an)\s+/i,                                    label: "persona-override" },
    { pattern: /\bsystem\s*:\s*(you|your|ignore|forget|act)/i,                    label: "system-prompt-inject" },
    { pattern: /\bnew\s+instructions?\s*:/i,                                       label: "new-instructions" },
    { pattern: /\bact\s+as\s+(if\s+you\s+are|a|an)\s+/i,                         label: "act-as-override" },
    { pattern: /\boverride\s+(safety|rules|guidelines|instructions)/i,             label: "safety-override" },
    { pattern: /\bdo\s+not\s+follow\s+(your|the|any)\s+(rules|instructions)/i,   label: "rule-bypass" },
    { pattern: /\bdeveloper\s+mode\s+(enabled|activated|on)/i,                    label: "developer-mode" },
    { pattern: /\bjailbreak/i,                                                     label: "jailbreak" },
    { pattern: /<\|.*?\|>/,                                                        label: "token-boundary-inject" },
    { pattern: /\[INST\]|\[\/?SYS\]|<<SYS>>/,                                    label: "llm-template-inject" },
];

/**
 * Scans a text block for known prompt injection patterns.
 * Returns the matched pattern label if injection is detected, null otherwise.
 */
function scanForPromptInjection(text: string): string | null {
    for (const { pattern, label } of PROMPT_INJECTION_PATTERNS) {
        if (pattern.test(text)) {
            return label;
        }
    }
    return null;
}

/**
 * Validate tool response content before returning to AI.
 * Blocks: oversized responses, binary data, and prompt injection attempts.
 * Returns error message if blocked, null if allowed.
 */
export function validateResponse(toolName: string, result: { content: Array<{ type: string; text: string }> }): string | null {
    if (!result || !result.content) return null;

    for (const block of result.content) {
        if (block.type !== "text" || !block.text) continue;

        // 1. Check response size
        if (block.text.length > CONFIG.MAX_RESPONSE_SIZE) {
            return `[DISCIPLINE] Response too large (${(block.text.length / 1024).toFixed(1)}KB, max: ${(CONFIG.MAX_RESPONSE_SIZE / 1024).toFixed(1)}KB).`;
        }

        // 2. Block binary/gibberish content in text responses
        const nonPrintable = (block.text.match(/[^\x20-\x7E\n\r\t]/g) || []).length;
        if (nonPrintable > block.text.length * 0.3) {
            return `[DISCIPLINE] Response contains too much binary data (${nonPrintable} non-printable chars). Blocked.`;
        }

        // 3. Prompt injection detection — scan for adversarial override patterns
        // that may have been embedded in file content, API responses, or user input.
        const injectionLabel = scanForPromptInjection(block.text);
        if (injectionLabel) {
            return `[DISCIPLINE] Prompt injection pattern detected in "${toolName}" response (pattern: ${injectionLabel}). Response blocked to protect agent integrity.`;
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
    const discipline = getOrCreateAgent(agent);

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
    // Load all from database to sync in-memory cache
    try {
        const allDb = AtabeyStorage.getAllDiscipline();
        for (const item of allDb) {
            if (!agentDiscipline.has(item.agent)) {
                getOrCreateAgent(item.agent);
            }
        }
    } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }

    const stats: Record<string, ReturnType<typeof getDisciplineStats>> = {};
    for (const [agent] of agentDiscipline) {
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
    try {
        AtabeyStorage.clearAllDiscipline();
        AtabeyStorage.clearDisciplineCalls();
    } catch (err) { logger.debug("Discipline engine state persistence failed (non-fatal)", err); }
}

export { CONFIG as DisciplineConfig };
