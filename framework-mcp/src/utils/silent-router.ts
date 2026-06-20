/**
 * ─── SILENT ROUTER ─────────────────────────────────────────────────
 *
 * Automatically routes tool calls to the most appropriate agent
 * WITHOUT requiring the developer to type `@agent` commands.
 *
 * The magic: developer types "Make this API secure" and Atabey
 * silently activates @security agent rules behind the scenes.
 *
 * Features:
 * - Auto-agent detection from tool call context
 * - Silent system prompt injection
 * - Multi-agent chain support
 * - Stealth notifications (stderr/dashboard only, never chat)
 */

import { RoutingEngine } from "../../../src/modules/engines/routing-engine.js";

// ─── Configuration ────────────────────────────────────────────────

const CONFIG = {
    /** Enable silent routing (default: true) */
    ENABLED: process.env.MCP_SILENT_ROUTING !== "false",
    /** Enable stealth notifications to stderr */
    STEALTH_NOTIFY: process.env.MCP_SILENT_STEALTH !== "false",
    /** Agent override via env (for testing/debugging) */
    FORCE_AGENT: process.env.MCP_FORCE_AGENT || null,
};

// ─── Agent Rule Cache ─────────────────────────────────────────────

interface AgentRules {
    name: string;
    identity: string;
    mission: string;
    rules: string[];
}

let agentRuleCache: Map<string, AgentRules> | null = null;

async function loadAgentRules(): Promise<Map<string, AgentRules>> {
    if (agentRuleCache) return agentRuleCache;

    try {
        const { ALL_AGENTS } = await import("../../../src/modules/agents/definitions.js");
        agentRuleCache = new Map();
        for (const agent of ALL_AGENTS) {
            agentRuleCache.set(agent.name, {
                name: agent.name,
                identity: agent.instructions.identity,
                mission: agent.instructions.mission,
                rules: agent.instructions.rules,
            });
        }
    } catch {
        // Fallback: use discipline rules file
        agentRuleCache = new Map();
    }

    return agentRuleCache!;
}

/**
 * Detect the most appropriate agent for a given tool call and arguments.
 * Uses RoutingEngine's TF-IDF matching on the args context.
 */
export function detectAgent(toolName: string, args: Record<string, unknown>): string {
    if (CONFIG.FORCE_AGENT) return CONFIG.FORCE_AGENT;

    // Build context from args for routing
    const contextParts: string[] = [toolName];

    for (const [key, value] of Object.entries(args)) {
        if (typeof value === "string") {
            contextParts.push(value);
        } else if (Array.isArray(value)) {
            contextParts.push(value.filter(v => typeof v === "string").join(" "));
        }
    }

    const context = contextParts.join(" ").substring(0, 500);

    // Use RoutingEngine to detect the best agent
    return RoutingEngine.resolveAgent(context);
}

/**
 * Get the system prompt rules for a given agent.
 * Used to inject discipline silently into tool context.
 */
export async function getAgentPrompt(agentName: string): Promise<string | null> {
    const rules = await loadAgentRules();
    const agent = rules.get(agentName.replace("@", ""));
    if (!agent) return null;

    return [
        `## [ATABEY SILENT] ${agent.name} (${agent.identity})`,
        "",
        "### Mission",
        `${agent.mission}`,
        "",
        "### Active Disciplines",
        ...agent.rules.map(r => `- ${r}`),
        "",
        "> These rules are injected by Atabey governance layer.",
        "> They supplement (not replace) your existing instructions.",
    ].join("\n");
}

/**
 * Build a silent context injection payload.
 * This is prepended to tool responses to guide the AI without @agent commands.
 */
export async function buildSilentContext(
    detectedAgent: string,
    toolName: string,
    responseText: string
): Promise<string> {
    if (!CONFIG.ENABLED) return responseText;

    const agentPrompt = await getAgentPrompt(detectedAgent);
    if (!agentPrompt) return responseText;

    // Only inject if the response is substantial enough to warrant governance
    if (responseText.length < 50) return responseText;

    // Inject as a comment block that won't break tool results
    const injection = [
        "",
        `<!-- ATABEY_GOVERNANCE agent="${detectedAgent}" tool="${toolName}" -->`,
        `${agentPrompt}`,
        "<!-- /ATABEY_GOVERNANCE -->",
        "",
    ].join("\n");

    return injection + responseText;
}

/**
 * Send a stealth notification to stderr (never to the chat).
 */
export function stealthNotify(agent: string, toolName: string, message: string): void {
    if (!CONFIG.STEALTH_NOTIFY) return;
    process.stderr.write(`[ATABEY:${agent}] ${message} (tool: ${toolName})\n`);
}

/**
 * Get silent router config.
 */
export function getSilentRouterConfig(): typeof CONFIG {
    return { ...CONFIG };
}

export { CONFIG as SilentRouterConfig };
