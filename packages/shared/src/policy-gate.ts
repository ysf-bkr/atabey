/**
 * PolicyGate — single decision point for mutating / sensitive operations.
 *
 * Phase 0 foundation for enterprise hard-gate security.
 * Every MCP mutating tool should call evaluateToolCall() before side effects.
 *
 * Decision is pure (no I/O) except optional hooks; MCP layer may enrich with
 * project-specific RBAC before/after this gate.
 */

export type PolicyEffect = "allow" | "deny";

export type PolicyCode =
    | "ALLOW"
    | "DENY_UNKNOWN_TOOL"
    | "DENY_PATH_TRAVERSAL"
    | "DENY_PROTECTED_PATH"
    | "DENY_ABSOLUTE_ESCAPE"
    | "DENY_RECON_MUTATION"
    | "DENY_SHELL_METACHAR"
    | "DENY_EMPTY_PATH";

export interface PolicyDecision {
    effect: PolicyEffect;
    code: PolicyCode;
    reason: string;
}

export interface ToolCallPolicyInput {
    tool: string;
    agent: string;
    args: Record<string, unknown>;
    /** Optional agent tier when known (supreme | core | recon). */
    tier?: "supreme" | "core" | "recon";
}

/** Tools that mutate disk, process state, or external systems. */
export const MUTATING_TOOLS = new Set([
    "write_file",
    "replace_text",
    "patch_file",
    "batch_surgical_edit",
    "run_shell_command",
    "compress_files",
    "decompress_files",
    "delete_knowledge",
    "update_project_memory",
    "store_knowledge",
    "update_contract_hash",
]);

/** Path-like arg keys commonly used by tools. */
const PATH_KEYS = ["path", "file", "filePath", "target", "output", "source", "archive"] as const;

/** Relative path segments that must never be written by agents by default. */
const PROTECTED_PATH_PATTERNS: RegExp[] = [
    /(^|\/)\.env(\.|$)/i,
    /(^|\/)\.env\.[^/]+$/i,
    /(^|\/)\.ssh(\/|$)/i,
    /(^|\/)\.gnupg(\/|$)/i,
    /(^|\/)id_rsa$/i,
    /(^|\/)id_ed25519$/i,
    /(^|\/)credentials\.json$/i,
    /(^|\/)\.aws\/credentials$/i,
    /(^|\/)\.npmrc$/i,
    /(^|\/)\.netrc$/i,
];

function allow(code: PolicyCode = "ALLOW", reason = "Allowed"): PolicyDecision {
    return { effect: "allow", code, reason };
}

function deny(code: PolicyCode, reason: string): PolicyDecision {
    return { effect: "deny", code, reason };
}

function collectPaths(args: Record<string, unknown>): string[] {
    const paths: string[] = [];
    for (const key of PATH_KEYS) {
        const v = args[key];
        if (typeof v === "string" && v.trim()) paths.push(v.trim());
    }
    // batch_surgical_edit
    if (Array.isArray(args.edits)) {
        for (const edit of args.edits) {
            if (edit && typeof edit === "object" && typeof (edit as { path?: string }).path === "string") {
                paths.push((edit as { path: string }).path.trim());
            }
        }
    }
    return paths;
}

/**
 * Normalize agent id to @name form.
 */
export function normalizeAgentId(agent: string): string {
    const a = (agent || "mcp-client").trim();
    if (!a) return "@mcp-client";
    return a.startsWith("@") ? a : `@${a}`;
}

/**
 * Evaluate a tool call against baseline hard rules (path safety, recon, shell meta).
 * Does NOT replace full RBAC matrix — call permissions layer separately or wrap here later.
 */
export function evaluateToolCall(input: ToolCallPolicyInput): PolicyDecision {
    const tool = input.tool;
    const agent = normalizeAgentId(input.agent);
    const tier = input.tier;
    const args = input.args || {};

    if (!tool) {
        return deny("DENY_UNKNOWN_TOOL", "Missing tool name");
    }

    const isMutating = MUTATING_TOOLS.has(tool);

    // Path safety for any tool that carries paths (read or write)
    const paths = collectPaths(args);
    for (const p of paths) {
        if (!p) {
            return deny("DENY_EMPTY_PATH", "Empty path argument is not allowed");
        }
        // Null bytes / obvious traversal
        if (p.includes("\0")) {
            return deny("DENY_PATH_TRAVERSAL", "Path contains illegal null byte");
        }
        // Windows + POSIX traversal
        if (p.includes("..")) {
            // Allow only if not used as parent segment — simple hard deny for Phase 0
            const segments = p.replace(/\\/g, "/").split("/");
            if (segments.some((s) => s === "..")) {
                return deny(
                    "DENY_PATH_TRAVERSAL",
                    `Path traversal denied for "${p}". Paths must stay inside the project root.`,
                );
            }
        }
        // Absolute paths that look like host escapes (MCP should still safePath; belt-and-suspenders)
        if (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p)) {
            // Absolute can be OK if still under project after safePath — flag high-risk patterns only
            if (
                p.startsWith("/etc") ||
                p.startsWith("/usr") ||
                p.startsWith("/bin") ||
                p.startsWith("/sbin") ||
                p.includes("/.ssh") ||
                p.startsWith("/System")
            ) {
                return deny(
                    "DENY_ABSOLUTE_ESCAPE",
                    `Absolute system path denied: "${p}"`,
                );
            }
        }

        if (isMutating) {
            const normalized = p.replace(/\\/g, "/");
            for (const re of PROTECTED_PATH_PATTERNS) {
                if (re.test(normalized)) {
                    return deny(
                        "DENY_PROTECTED_PATH",
                        `Write/mutate denied for protected path "${p}". Secrets and credential files are blocked by PolicyGate.`,
                    );
                }
            }
        }
    }

    // Recon agents: no mutating tools (matrix may later grant exceptions — Phase 0 hard deny)
    if (isMutating && tier === "recon") {
        return deny(
            "DENY_RECON_MUTATION",
            `Agent ${agent} (tier: recon) cannot invoke mutating tool "${tool}".`,
        );
    }

    // Shell metacharacters (defense in depth; shell tool also checks)
    if (tool === "run_shell_command") {
        const command = String(args.command ?? "");
        if (/[;&|><$`\n\r]/.test(command)) {
            return deny(
                "DENY_SHELL_METACHAR",
                "Shell metacharacters are forbidden to prevent command injection.",
            );
        }
    }

    return allow();
}

/**
 * True when decision is allow.
 */
export function isAllowed(decision: PolicyDecision): boolean {
    return decision.effect === "allow";
}

/**
 * Format decision for MCP error payloads.
 */
export function formatPolicyDenial(decision: PolicyDecision): string {
    return `[POLICY_GATE] ${decision.code}: ${decision.reason}`;
}
