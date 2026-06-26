/**
 * ─── RBAC PERMISSION MATRIX ───────────────────────────────────────────────
 *
 * Enforces agent-scoped file system permissions at the MCP tool layer.
 * This is the file-level RBAC enforcement point for:
 *   - Claude Code  (calls write_file / read_file via MCP sub-agents)
 *   - Gemini CLI   (calls write_file / read_file via MCP server)
 *   - Cursor       (calls write_file / read_file via MCP rules)
 *   - Codex CLI    (calls write_file / read_file via agent allowed-tools)
 *   - Antigravity  (calls write_file / read_file via customAgentSpec tools)
 *
 * Permission matrix is stored in `.atabey/permission-matrix.json`:
 * {
 *   "@frontend": { "write": ["apps/web/**"], "read": ["apps/web/**", "docs/**"] },
 *   "@backend":  { "write": ["apps/backend/**"], "read": ["apps/backend/**", "apps/web/types/**"] }
 * }
 *
 * Agent Tier enforcement:
 *   supreme (@manager, @security) — no write/read restrictions (omnipotent)
 *   core    (@backend, @frontend, ...) — matrix-enforced
 *   recon   (@explorer, @git, @analyst, @native) — read-only by default,
 *             write requires explicit matrix entry
 */

import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "./security.js";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface PermissionMatrix {
    [agent: string]: {
        write: string[];
        read?: string[];
    };
}

/** Atabey AgentTier — mirrors src/modules/agents/types.ts */
export type AgentTier = "supreme" | "core" | "recon";

// ─── Tier hierarchy ─────────────────────────────────────────────────────────

/** Well-known tier for agents defined in the built-in registry */
const AGENT_TIER_MAP: Record<string, AgentTier> = {
    "@manager":  "supreme",
    "@security": "supreme",
    "@backend":  "core",
    "@frontend": "core",
    "@mobile":   "core",
    "@quality":  "core",
    "@database": "core",
    "@devops":   "core",
    "@architect":"core",
    "@explorer": "recon",
    "@git":      "recon",
    "@analyst":  "recon",
    "@native":   "recon",
};

export function getAgentTier(agentName: string): AgentTier {
    return AGENT_TIER_MAP[agentName] ?? "core"; // unknown agents default to core
}

// ─── Glob → RegExp ──────────────────────────────────────────────────────────

function globToRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const step1 = escaped.replace(/\*\*/g, "__DBL_STR__");
    const step2 = step1.replace(/\*/g, "[^/]*");
    const regexStr = "^" + step2.replace(/__DBL_STR__/g, ".*") + "$";
    return new RegExp(regexStr);
}

// ─── Active Agent Resolution ─────────────────────────────────────────────────

/**
 * Resolves the active agent for the current operation.
 *
 * Priority order:
 * 1. ATABEY_ACTIVE_AGENT env var (set by AgentLoop per-invocation — most reliable)
 * 2. `.atabey/memory/status.json` first EXECUTING agent (legacy fallback)
 *
 * Note: The traceId-scoped approach is preferred when AgentLoop sets
 * ATABEY_ACTIVE_AGENT before spawning the MCP tool call.
 */
export function resolveActiveAgent(frameworkDir: string): string | null {
    // 1. Env var (highest reliability — set by orchestration layer)
    const envAgent = process.env.ATABEY_ACTIVE_AGENT?.trim();
    if (envAgent) {
        return envAgent.startsWith("@") ? envAgent : `@${envAgent}`;
    }

    // 2. status.json fallback
    const statusPath = path.join(frameworkDir, "memory", "status.json");
    if (!fs.existsSync(statusPath)) return null;

    try {
        const status = JSON.parse(fs.readFileSync(statusPath, "utf8")) as Record<string, { state: string }>;
        for (const [agentName, info] of Object.entries(status)) {
            if (info.state === "EXECUTING") {
                return agentName.startsWith("@") ? agentName : `@${agentName}`;
            }
        }
    } catch (e) {
        process.stderr.write(`[Permissions] Warning: Failed to read status.json: ${String(e)}\n`);
    }

    return null;
}

// ─── Matrix Loader ───────────────────────────────────────────────────────────

function loadMatrix(frameworkDir: string): PermissionMatrix | null {
    const matrixPath = path.join(frameworkDir, "permission-matrix.json");
    if (!fs.existsSync(matrixPath)) return null;

    try {
        return JSON.parse(fs.readFileSync(matrixPath, "utf8")) as PermissionMatrix;
    } catch (e) {
        throw new Error(`Failed to parse permission-matrix.json: ${String(e)}`, { cause: e });
    }
}

// ─── Core Enforcement ───────────────────────────────────────────────────────

type AccessType = "write" | "read";

/**
 * Internal enforcement logic for both read and write operations.
 *
 * Enforcement logic per tier:
 * - supreme: always allowed (no matrix needed)
 * - core: enforced by matrix; if no rule defined → default-allow
 * - recon: write → always denied unless explicit matrix allow
 *           read  → allowed by default (recon agents must be able to explore)
 */
function enforcePermission(
    projectRoot: string,
    targetFilePath: string,
    accessType: AccessType
): void {
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir)
        ? frameworkDir
        : path.resolve(projectRoot, frameworkDir);

    const activeAgent = resolveActiveAgent(absoluteFrameworkPath);

    // No active agent identified → default-allow (non-agent call, e.g. CLI tools)
    if (!activeAgent) return;

    const tier = getAgentTier(activeAgent);

    // Supreme agents are omnipotent — no matrix enforcement
    if (tier === "supreme") return;

    // Recon agents: block writes unless explicitly allowed in matrix
    if (tier === "recon" && accessType === "write") {
        const matrix = loadMatrix(absoluteFrameworkPath);
        if (!matrix) {
            throw new Error(
                `Permission Denied: Agent ${activeAgent} (tier: recon) cannot write files. ` +
                "Recon agents (@explorer, @git, @analyst, @native) are read-only by default. " +
                "Add an explicit write rule to permission-matrix.json to grant write access."
            );
        }
        const agentRules = matrix[activeAgent];
        if (!agentRules?.write?.length) {
            throw new Error(
                `Permission Denied: Agent ${activeAgent} (tier: recon) has no write rules in permission-matrix.json. ` +
                "Recon agents are read-only by default."
            );
        }
        // Fall through to glob check below
    }

    const matrix = loadMatrix(absoluteFrameworkPath);

    // No matrix file → default-allow (matrix is opt-in)
    if (!matrix) return;

    const agentRules = matrix[activeAgent];

    // No rules for this agent → default-allow
    if (!agentRules) return;

    const rules = accessType === "write" ? agentRules.write : (agentRules.read ?? null);

    // No rule for this access type → default-allow
    if (!rules) return;

    const relativeTargetPath = path.relative(
        projectRoot,
        path.resolve(projectRoot, targetFilePath)
    );

    const allowed = rules.some(glob => globToRegex(glob).test(relativeTargetPath));

    if (!allowed) {
        throw new Error(
            `Permission Denied: Agent ${activeAgent} (tier: ${tier}) is not authorized to ` +
            `${accessType} "${relativeTargetPath}". ` +
            `Matrix rules restrict ${accessType} to: [${rules.join(", ")}].`
        );
    }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Verifies that the active agent has WRITE permission for the target file.
 * Called by: write_file, replace_text, batch_surgical_edit, patch_file
 *
 * Throws a descriptive error if permission is denied.
 */
export function verifyWritePermission(projectRoot: string, targetFilePath: string): void {
    enforcePermission(projectRoot, targetFilePath, "write");
}

/**
 * Verifies that the active agent has READ permission for the target file.
 * Called by: read_file, view_file (alias)
 *
 * Throws a descriptive error if permission is denied.
 * Note: read enforcement is SOFTER than write — recon agents can read freely
 * unless an explicit read matrix restriction is defined.
 */
export function verifyReadPermission(projectRoot: string, targetFilePath: string): void {
    enforcePermission(projectRoot, targetFilePath, "read");
}

/**
 * Verifies that the sender agent is allowed to send messages to the target agent
 * based on the AgentTier hierarchy.
 *
 * Messaging rules (AI IDE governance layer):
 * - Any tier → supreme:  allowed (escalation always permitted)
 * - core → core:         allowed
 * - recon → core:        allowed (recon can delegate up)
 * - recon → supreme:     allowed
 * - core → recon:        BLOCKED (core agents should not delegate down to recon)
 * - supreme → any:       allowed
 *
 * Rationale: Recon agents (@explorer, @git) are information-gatherers.
 * If a core agent delegates to a recon agent, it bypasses the quality gate
 * and risk engine — a potential governance gap.
 */
export function verifyMessagingPermission(fromAgent: string, toAgent: string): void {
    const fromTier = getAgentTier(fromAgent);
    const toTier   = getAgentTier(toAgent);

    // supreme senders: unrestricted
    if (fromTier === "supreme") return;

    // core → recon: block (prevents quality-gate bypass via recon delegation)
    if (fromTier === "core" && toTier === "recon") {
        throw new Error(
            `[RBAC] Messaging violation: Agent ${fromAgent} (tier: core) cannot delegate to ` +
            `${toAgent} (tier: recon). Core agents must delegate up to @manager or peer core agents. ` +
            "Recon agents are read-only information gatherers and cannot execute delegated tasks."
        );
    }
}

