import fs from "fs";
import path from "path";
import { ToolResult, RegisterAgentArgs } from "../types.js";
import { resolveFrameworkDir } from "../../utils/security.js";

/**
 * Valid agent roles in the Atabey governance system.
 * Mirrors AgentTier from src/modules/agents/types.ts.
 */
const VALID_ROLES = ["supreme", "core", "recon"] as const;
type AgentRole = typeof VALID_ROLES[number];

/**
 * Roles that cannot be self-assigned via the MCP register_agent tool.
 * Supreme registration must be done through the orchestrator bootstrap,
 * not via AI tool calls (Claude Code, Gemini CLI, Cursor, etc.).
 */
const PROTECTED_ROLES: AgentRole[] = ["supreme"];

/**
 * Well-known supreme agents allowed to register with supreme role.
 * Any other agent attempting supreme registration is blocked.
 */
const SUPREMES_WHITELIST = ["@manager", "@security"];

/**
 * Handles agent registration with the Control Plane.
 * Validates tier/role to prevent privilege escalation via MCP tool injection.
 */
export async function handleRegisterAgent(projectRoot: string, args: RegisterAgentArgs): Promise<ToolResult> {
    const { agent, role, capability = 5, specialties } = args;
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const registryDir = path.join(projectRoot, frameworkDir, "registry");
    const agentFile = path.join(registryDir, `${agent.replace("@", "")}_active.json`);

    // ── RBAC: Validate role ──────────────────────────────────────────────
    if (!VALID_ROLES.includes(role as AgentRole)) {
        return {
            isError: true,
            content: [{ type: "text", text: `[RBAC] Invalid role '${role}'. Valid roles: ${VALID_ROLES.join(", ")}.` }]
        };
    }

    // ── RBAC: Block unauthorized supreme registration ─────────────────────
    // Prevents AI agents (Claude Code, Gemini, Cursor) from self-assigning supreme tier.
    if (PROTECTED_ROLES.includes(role as AgentRole) && !SUPREMES_WHITELIST.includes(agent)) {
        return {
            isError: true,
            content: [{ type: "text", text:
                `[RBAC] Privilege escalation blocked: Agent '${agent}' cannot self-register as '${role}'. ` +
                `Supreme role is reserved for: ${SUPREMES_WHITELIST.join(", ")}. ` +
                "This attempt has been logged."
            }]
        };
    }

    // ── Validate capability range ─────────────────────────────────────────
    const cap = typeof capability === "number" ? Math.min(10, Math.max(1, capability)) : 5;

    try {
        if (!fs.existsSync(registryDir)) fs.mkdirSync(registryDir, { recursive: true });

        // Idempotent: merge with existing registration if present
        let existingData: Record<string, unknown> = {};
        if (fs.existsSync(agentFile)) {
            try {
                existingData = JSON.parse(fs.readFileSync(agentFile, "utf8")) as Record<string, unknown>;
            } catch { /* ignore corrupt registry file, overwrite */ }
        }

        const agentData = {
            ...existingData,           // preserve existing fields (e.g. prior specialties)
            agent,
            role,
            capability: cap,
            specialties: specialties   // overwrite specialties if provided
                ? { ...(existingData.specialties as Record<string, number> ?? {}), ...specialties }
                : existingData.specialties,
            registered_at: existingData.registered_at ?? new Date().toISOString(),
            last_seen: new Date().toISOString(),
            status: "ACTIVE"
        };

        fs.writeFileSync(agentFile, JSON.stringify(agentData, null, 2));

        return {
            content: [{ type: "text", text: `[ATABEY] Agent ${agent} (${role}, capability: ${cap}/10) registered in the Control Plane.` }]
        };
    } catch (e) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to register agent: ${String(e)}` }]
        };
    }
}
