/**
 * MCP adapter around shared PolicyGate + agent tier resolution.
 * Call evaluateMutatingTool() from governance middleware before tool handlers run.
 */

import {
    evaluateToolCall,
    formatPolicyDenial,
    isAllowed,
    normalizeAgentId,
    type PolicyDecision,
    MUTATING_TOOLS,
} from "atabey-shared/policy-gate.js";
import { getAgentTier, resolveActiveAgent } from "./permissions.js";
import { resolveFrameworkDir } from "./security.js";
import path from "path";

export { MUTATING_TOOLS, formatPolicyDenial, isAllowed };
export type { PolicyDecision };

export interface McpPolicyContext {
    projectRoot: string;
    tool: string;
    args: Record<string, unknown>;
    /** Client-reported agent name (fallback). */
    clientAgent?: string;
}

/**
 * Resolve best-effort agent + tier and run shared PolicyGate.
 */
export function evaluateMutatingTool(ctx: McpPolicyContext): PolicyDecision {
    const frameworkDir = resolveFrameworkDir(ctx.projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir)
        ? frameworkDir
        : path.resolve(ctx.projectRoot, frameworkDir);

    const active = resolveActiveAgent(absoluteFrameworkPath);
    const agent = normalizeAgentId(active || ctx.clientAgent || "mcp-client");
    const tier = getAgentTier(agent);

    return evaluateToolCall({
        tool: ctx.tool,
        agent,
        args: ctx.args,
        tier,
    });
}

/**
 * Returns denial message or null if allowed.
 * Non-mutating tools always pass this hard gate (other layers still apply).
 */
export function denyIfMutatingBlocked(ctx: McpPolicyContext): string | null {
    if (!MUTATING_TOOLS.has(ctx.tool)) return null;
    const decision = evaluateMutatingTool(ctx);
    if (isAllowed(decision)) return null;
    return formatPolicyDenial(decision);
}
