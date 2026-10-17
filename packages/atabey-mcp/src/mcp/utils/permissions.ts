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
import { isAgentIdentityEnforced, verifyAgentToken } from "atabey-shared/agent-identity.js";
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
    // 0. Cryptographic identity (preferred): a signed ATABEY_AGENT_TOKEN cannot
    //    be forged by a subprocess, unlike the plain ATABEY_ACTIVE_AGENT env var.
    const token = process.env.ATABEY_AGENT_TOKEN?.trim();
    if (token) {
        const result = verifyAgentToken(token);
        if (result.valid && result.agent) {
            return result.agent;
        }
        // A provided-but-invalid token always fails closed.
        throw new Error(`[AGENT_IDENTITY] Invalid agent token: ${result.reason}`);
    }
    if (isAgentIdentityEnforced()) {
        throw new Error("[AGENT_IDENTITY] ATABEY_AGENT_TOKEN is required (ATABEY_AGENT_IDENTITY_REQUIRED=true).");
    }

    // 1. Env var (legacy fallback — set by the orchestration layer)
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
 * Critical security/governance paths that NO agent (including supreme @manager/@security)
 * may overwrite via tool calls. Prevents policy self-modification and credential tampering.
 */
const SUPREME_PROTECTED_WRITE_PATTERNS: RegExp[] = [
    /(^|\/)\.env(\.|$)/i,
    /(^|\/)\.env\.[^/]+$/i,
    /(^|\/)\.ssh(\/|$)/i,
    /(^|\/)\.gnupg(\/|$)/i,
    /(^|\/)\.git\/hooks(\/|$)/i,
    /(^|\/)\.git\/config$/i,
    /(^|\/)\.atabey\/permission-matrix\.json$/i,
    /(^|\/)\.atabey\/audit-hmac\.key$/i,
    /(^|\/)\.atabey\/master\.key$/i,
    /(^|\/)\.atabey\/secrets\.vault\.json$/i,
    /\.pem$/i,
    /\.key$/i,
];

/** Tools whose path arguments represent write/mutation operations. */
const WRITE_PATH_TOOLS = new Set([
    "write_file",
    "replace_text",
    "patch_file",
    "batch_surgical_edit",
]);

/** Tools whose path arguments represent read/inspection operations. */
const READ_PATH_TOOLS = new Set([
    "read_file",
    "grep_search",
    "list_dir",
    "get_project_map",
    "get_project_gaps",
    "analyze_code_quality",
    "check_architecture_compliance",
    "check_lint",
    // legacy/alias names kept for backwards compatibility
    "search_files",
    "list_directory",
    "get_file_outline",
    "read_symbol",
    "find_references",
]);

/**
 * Internal enforcement logic for both read and write operations.
 *
 * Enforcement logic per tier:
 * - supreme (@manager, @security):
 *     - ALWAYS blocked from writing SUPREME_PROTECTED_WRITE_PATTERNS (self-governance / keys)
 *     - Enforced by matrix whenever an explicit rule is defined for @manager/@security
 *     - Default-allow when no rule is defined for them
 * - core: enforced by matrix; if no rule defined → default-allow
 * - recon: write → always denied unless explicit matrix allow
 *          read  → allowed by default unless explicit read matrix restriction
 */
function enforcePermission(
    projectRoot: string,
    targetFilePath: string,
    accessType: AccessType,
    agentOverride?: string,
): void {
    const relativeTargetPath = path
        .relative(projectRoot, path.resolve(projectRoot, targetFilePath))
        .replace(/\\/g, "/");

    // 1. Universal critical path protection for writes (applies even to supreme tier)
    if (accessType === "write") {
        for (const re of SUPREME_PROTECTED_WRITE_PATTERNS) {
            if (re.test(relativeTargetPath) || re.test(targetFilePath.replace(/\\/g, "/"))) {
                throw new Error(
                    `Permission Denied: Critical governance/security path "${relativeTargetPath}" is protected ` +
                    "and cannot be modified by any agent (including supreme tier).",
                );
            }
        }
    }

    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir)
        ? frameworkDir
        : path.resolve(projectRoot, frameworkDir);

    const resolved = resolveActiveAgent(absoluteFrameworkPath) || (
        agentOverride && agentOverride !== "mcp-client"
            ? (agentOverride.startsWith("@") ? agentOverride : `@${agentOverride}`)
            : null
    );

    // No active agent identified → default-allow (non-agent call, e.g. CLI tools)
    if (!resolved) return;

    const activeAgent = resolved;
    const tier = getAgentTier(activeAgent);
    const matrix = loadMatrix(absoluteFrameworkPath);

    // Recon agents: block writes unless explicitly allowed in matrix
    if (tier === "recon" && accessType === "write") {
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

    // No matrix file → default-allow (matrix is opt-in for core/supreme)
    if (!matrix) return;

    const agentRules = matrix[activeAgent];

    // No rules for this agent → default-allow (including supreme when not explicitly scoped)
    if (!agentRules) return;

    const rules = accessType === "write" ? agentRules.write : (agentRules.read ?? null);

    // No rule for this access type → default-allow
    if (!rules) return;

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
 * Called by: governance middleware + write_file, replace_text, batch_surgical_edit, patch_file
 *
 * Throws a descriptive error if permission is denied.
 */
export function verifyWritePermission(projectRoot: string, targetFilePath: string, agentOverride?: string): void {
    enforcePermission(projectRoot, targetFilePath, "write", agentOverride);
}

/**
 * Verifies that the active agent has READ permission for the target file.
 * Called by: governance middleware + read_file
 *
 * Throws a descriptive error if permission is denied.
 */
export function verifyReadPermission(projectRoot: string, targetFilePath: string, agentOverride?: string): void {
    enforcePermission(projectRoot, targetFilePath, "read", agentOverride);
}

/**
 * Universal middleware hook: enforces Permission Matrix across any MCP tool call
 * that carries file/directory path arguments.
 */
export function enforceToolPermissionMatrix(
    projectRoot: string,
    toolName: string,
    args: Record<string, unknown>,
    clientAgent?: string,
): void {
    const isWrite = WRITE_PATH_TOOLS.has(toolName);
    const isRead = READ_PATH_TOOLS.has(toolName);
    if (!isWrite && !isRead) return;

    const writePaths: string[] = [];
    const readPaths: string[] = [];

    if (isWrite) {
        for (const key of ["path", "file", "filePath", "target", "output"]) {
            const val = args[key];
            if (typeof val === "string" && val.trim()) writePaths.push(val.trim());
        }
        if (Array.isArray(args.edits)) {
            for (const edit of args.edits) {
                if (edit && typeof edit === "object" && typeof (edit as { path?: string }).path === "string") {
                    writePaths.push((edit as { path: string }).path.trim());
                }
            }
        }
    } else if (isRead) {
        for (const key of ["path", "file", "filePath", "target", "directory"]) {
            const val = args[key];
            if (typeof val === "string" && val.trim()) readPaths.push(val.trim());
        }
    }

    for (const p of writePaths) {
        verifyWritePermission(projectRoot, p, clientAgent);
    }
    for (const p of readPaths) {
        verifyReadPermission(projectRoot, p, clientAgent);
    }
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

