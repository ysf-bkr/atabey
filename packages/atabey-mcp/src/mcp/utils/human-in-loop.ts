/**
 * ─── HUMAN-IN-THE-LOOP (In-CLI Approval) ──────────────────────────
 *
 * Allows risk-gated approvals without the developer leaving their AI CLI chat.
 *
 * Key Innovation: Instead of forcing developers to switch to a web dashboard
 * or another terminal, approval requests are sent as MCP notifications into
 * the developer's existing chat interface.
 *
 * Flow:
 * 1. Tool call triggers risk detection
 * 2. If risk >= threshold, tool is blocked with a structured error
 * 3. Error message includes the traceId and approval command
 * 4. Developer types "atabey approve <traceId>" in the same chat
 * 5. Hermes message status updates → retry succeeds
 *
 * Risk Levels:
 * - LOW (0-30): Silent pass (no approval needed)
 * - MEDIUM (31-59): Stealth warning to stderr only
 * - HIGH (60-100): Blocked until approval
 */

import { AtabeyStorage } from "../../shared/storage.js";
import { asAgentID, asTraceID } from "../../shared/types.js";

// ─── Configuration ────────────────────────────────────────────────

const CONFIG = {
    /** Risk threshold for blocking (0-100) */
    HIGH_RISK_THRESHOLD: parseInt(process.env.MCP_HIGH_RISK_THRESHOLD || "60", 10),
    /** Risk threshold for medium warning */
    MEDIUM_RISK_THRESHOLD: parseInt(process.env.MCP_MEDIUM_RISK_THRESHOLD || "30", 10),
    /** Auto-approve low risk operations */
    AUTO_APPROVE_LOW_RISK: process.env.MCP_AUTO_APPROVE_LOW_RISK !== "false",
    /** Approval timeout in seconds */
    APPROVAL_TIMEOUT_SECONDS: parseInt(process.env.MCP_APPROVAL_TIMEOUT || "300", 10), // 5 min
    /**
     * Minimum risk score requiring Lead/Admin approval (legacy compat).
     * Superseded by ROLE_RISK_MAP below — kept for backward compatibility with env var.
     */
    RBAC_HIGH_RISK_THRESHOLD: parseInt(process.env.MCP_RBAC_HIGH_RISK_THRESHOLD || "80", 10),
};

// ─── Role Hierarchy ──────────────────────────────────────────────────────────
//
// Defines which roles can approve operations at each risk level.
// This is the AI Governance layer for IDE/CLI tool orchestrators:
//   Claude Code, Gemini CLI, Cursor, Copilot all route through this gate.
//
// Role:        Can approve operations with risk score >=
//   junior      → NONE (cannot approve anything, read-only user)
//   developer   → MEDIUM (30+)
//   lead        → HIGH (60+)
//   admin       → any (0+, including CRITICAL)
//
// The role is read EXCLUSIVELY from process.env.MCP_USER_ROLE.
// The userRole parameter in approveOperation/rejectOperation is intentionally
// IGNORED to prevent privilege escalation via AI tool argument injection.
// (e.g. an AI calling approve_operation {userRole: "admin"} must not work.)

export type UserRole = "junior" | "developer" | "lead" | "admin";

/**
 * Maximum risk score each role is allowed to approve.
 * A role can approve any operation with riskScore <= its max.
 * Override via MCP_RBAC_ROLE_* env vars.
 *
 *   junior    → cannot approve anything (max = -1)
 *   developer → can approve MEDIUM risk (0–59)
 *   lead      → can approve HIGH risk (0–79)
 *   admin     → can approve any risk (0–100)
 */
export const ROLE_RISK_MAP: Record<UserRole, number> = {
    admin:     parseInt(process.env.MCP_RBAC_ROLE_ADMIN     || "100",  10),
    lead:      parseInt(process.env.MCP_RBAC_ROLE_LEAD      || "79",   10),
    developer: parseInt(process.env.MCP_RBAC_ROLE_DEVELOPER || "59",   10),
    junior:    parseInt(process.env.MCP_RBAC_ROLE_JUNIOR    || "-1",   10), // cannot approve
};

/**
 * Returns the minimum role required to approve an operation at the given risk score.
 */
export function getMinimumRoleForScore(riskScore: number): UserRole {
    if (riskScore <= ROLE_RISK_MAP.developer) return "developer";
    if (riskScore <= ROLE_RISK_MAP.lead)      return "lead";
    return "admin";
}

/**
 * Reads the active user role from environment only.
 * AI-supplied userRole arguments are NOT trusted.
 */
function getActiveUserRole(): UserRole {
    const envRole = process.env.MCP_USER_ROLE?.trim().toLowerCase();
    if (envRole === "admin" || envRole === "lead" || envRole === "developer" || envRole === "junior") {
        return envRole;
    }
    return "junior"; // safest default
}

// ─── Types ────────────────────────────────────────────────────────

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ApprovalRequest {
    traceId: string;
    toolName: string;
    agent: string;
    riskScore: number;
    riskLevel: RiskLevel;
    reason: string;
    args: Record<string, unknown>;
    createdAt: number;
    expiresAt: number;
    status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
    passcode?: string;
}

// ─── Active Approval Requests ─────────────────────────────────────

const activeApprovals = new Map<string, ApprovalRequest>();

/**
 * Determine risk level from risk score.
 */
export function getRiskLevel(score: number): RiskLevel {
    if (score >= CONFIG.HIGH_RISK_THRESHOLD) return "HIGH";
    if (score >= CONFIG.MEDIUM_RISK_THRESHOLD) return "MEDIUM";
    return "LOW";
}

/**
 * Create an approval request for a high-risk operation.
 * Returns the approval request and a message for the AI/developer.
 */
function generatePasscode(): string {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Create an approval request for a high-risk operation.
 * Returns the approval request and a message for the AI/developer.
 */
export function createApprovalRequest(
    traceId: string,
    toolName: string,
    agent: string,
    riskScore: number,
    reason: string,
    args: Record<string, unknown>
): { request: ApprovalRequest; message: string } {
    const now = Date.now();
    const passcode = generatePasscode();

    const request: ApprovalRequest = {
        traceId,
        toolName,
        agent,
        riskScore,
        riskLevel: getRiskLevel(riskScore),
        reason,
        args,
        createdAt: now,
        expiresAt: now + CONFIG.APPROVAL_TIMEOUT_SECONDS * 1000,
        status: "PENDING",
        passcode,
    };

    activeApprovals.set(traceId, request);
    try {
        AtabeyStorage.saveApproval(request);
    } catch (e) {
        // Non-fatal
    }

    // Print passcode to stderr so the human developer sees it but AI cannot access it
    process.stderr.write(`\n[ATABEY SECURITY GATES] APPROVAL PASSCODE FOR TRACE ${traceId}: ${passcode}\n\n`);

    // Create a Hermes approval message
    AtabeyStorage.saveMessage({
        from: asAgentID(agent),
        to: asAgentID("@manager"),
        category: "ALERT",
        content: JSON.stringify({
            type: "APPROVAL_REQUIRED",
            traceId,
            tool: toolName,
            riskScore,
            reason,
        }),
        traceId: asTraceID(traceId),
        timestamp: new Date().toISOString(),
        status: "PENDING",
        priority: "HIGH",
        requiresApproval: true,
    });

    // Build the in-chat approval message
    // This is what the developer sees in their AI CLI chat
    const message = [
        `[RISK GATE] Operation blocked: ${reason}`,
        "",
        `  Tool:       ${toolName}`,
        `  Agent:      ${agent}`,
        `  Risk Score: ${riskScore}/100 (${request.riskLevel})`,
        `  Trace ID:   ${traceId}`,
        "",
        "─── IN-CHAT APPROVAL ────────────────────────────────────────",
        "This is a high-risk operation. To prevent autonomous bypass,",
        "Atabey has printed a 5-character PASSCODE to your terminal's stderr.",
        "",
        "Ask the user for the passcode, then call the approve_operation tool:",
        `  approve_operation { "action": "approve", "traceId": "${traceId}", "passcode": "<passcode_from_user>" }`,
        "─────────────────────────────────────────────────────────────",
        "",
        `Alternative: Run 'atabey approve ${traceId}' in your local terminal.`,
    ].join("\n");

    return { request, message };
}

/**
 * Check if an operation should be blocked based on risk score.
 * Returns:
 * - null if allowed (LOW risk or auto-approved)
 * - { blocked: true, message } if blocked (HIGH risk)
 * - { blocked: false, warning } if warning only (MEDIUM risk)
 */
export function checkRiskGate(
    traceId: string,
    toolName: string,
    agent: string,
    riskScore: number,
    reason: string,
    args: Record<string, unknown>
): { blocked: boolean; message: string | null; warning?: string } | null {
    const level = getRiskLevel(riskScore);

    // LOW risk: always pass
    if (level === "LOW") {
        return null;
    }

    // MEDIUM risk: warning only
    if (level === "MEDIUM") {
        return {
            blocked: false,
            message: null,
            warning: `[RISK WARNING] ${reason} (risk: ${riskScore}/100). Monitor this operation.`,
        };
    }

    // HIGH risk: block and create approval request
    const { message } = createApprovalRequest(traceId, toolName, agent, riskScore, reason, args);

    return {
        blocked: true,
        message,
    };
}

/**
 * Check if an approval request exists and is still valid.
 */
export function getApprovalStatus(traceId: string): ApprovalRequest | null {
    let request = activeApprovals.get(traceId);
    if (!request) {
        try {
            request = (AtabeyStorage.getApproval(traceId) as ApprovalRequest | null) || undefined;
            if (request) activeApprovals.set(traceId, request);
        } catch { /* ignore */ }
    }
    if (!request) return null;

    // Check if expired
    if (Date.now() > request.expiresAt) {
        request.status = "EXPIRED";
        try {
            AtabeyStorage.updateApprovalStatus(traceId, "EXPIRED");
        } catch { /* ignore */ }
        return request;
    }

    return request;
}

/**
 * Approve a pending operation.
 *
 * RBAC enforcement (AI Governance layer):
 * - Role is read from process.env.MCP_USER_ROLE ONLY.
 * - The userRole parameter is accepted for API compatibility but completely IGNORED.
 *   This prevents AI agents (Claude Code, Gemini, Cursor) from escalating privilege
 *   by passing {userRole: "admin"} in the tool call arguments.
 * - The passcode printed to stderr is the second factor — AI cannot read stderr.
 */
export function approveOperation(
    traceId: string,
    passcode?: string,
    _userRoleIgnored?: string,   // kept for API compat — value is intentionally ignored
    bypassChecks = false
): { success: boolean; message: string } {
    let request = activeApprovals.get(traceId);
    if (!request) {
        try {
            request = (AtabeyStorage.getApproval(traceId) as ApprovalRequest | null) || undefined;
            if (request) activeApprovals.set(traceId, request);
        } catch { /* ignore */ }
    }
    if (!request) {
        return { success: false, message: `No pending approval found for trace: ${traceId}` };
    }

    if (request.status !== "PENDING") {
        return { success: false, message: `Approval for ${traceId} is already ${request.status}` };
    }

    let role = "web-admin";
    if (!bypassChecks) {
        // ── RBAC Check ──────────────────────────────────────────────────────────
        // Role is read exclusively from the environment — not from the tool argument.
        // This ensures Claude Code, Gemini CLI, Cursor, or any MCP client cannot
        // escalate privilege by injecting a role in the tool args.
        role = getActiveUserRole();
        const maxApprovable = ROLE_RISK_MAP[role as UserRole];

        if (request.riskScore <= maxApprovable) {
            // Role is allowed — proceed to passcode check
        } else {
            const requiredRole = getMinimumRoleForScore(request.riskScore);
            return {
                success: false,
                message:
                    `[RBAC] Approval denied: Risk score ${request.riskScore}/100 requires at least '${requiredRole}' role. ` +
                    `Current role: '${role}' (max approvable: ${maxApprovable}). ` +
                    "Set MCP_USER_ROLE env var to a role with sufficient authority."
            };
        }
        // ── End RBAC Check ──────────────────────────────────────────────────────

        // Passcode second-factor (printed to stderr — AI cannot intercept)
        if (request.passcode && (!passcode || passcode.trim().toUpperCase() !== request.passcode)) {
            return { success: false, message: "Invalid or missing approval passcode. Verify the passcode printed to stderr." };
        }
    }

    request.status = "APPROVED";
    try {
        AtabeyStorage.updateApprovalStatus(traceId, "APPROVED");
    } catch { /* ignore */ }

    // Update Hermes message status
    const messages = AtabeyStorage.getPendingMessages();
    const pendingMsgs = messages.filter(
        m => m.traceId === traceId && m.category === "ALERT" && m.status === "PENDING"
    );
    for (const msg of pendingMsgs) {
        if (msg.id !== undefined) {
            AtabeyStorage.updateMessageStatus(msg.id as number, "APPROVED");
        }
    }

    return { success: true, message: `Operation ${traceId} approved by '${role}'. You may retry.` };
}

/**
 * Reject a pending operation.
 *
 * RBAC: junior-role users cannot reject HIGH/CRITICAL operations.
 * This prevents rogue or misconfigured recon agents from killing
 * manager-delegated critical operations.
 */
export function rejectOperation(
    traceId: string,
    _userRoleIgnored?: string,   // kept for API compat — value intentionally ignored
    bypassChecks = false
): { success: boolean; message: string } {
    let request = activeApprovals.get(traceId);
    if (!request) {
        try {
            request = (AtabeyStorage.getApproval(traceId) as ApprovalRequest | null) || undefined;
            if (request) activeApprovals.set(traceId, request);
        } catch { /* ignore */ }
    }
    if (!request) {
        return { success: false, message: `No pending approval found for trace: ${traceId}` };
    }

    if (request.status !== "PENDING") {
        return { success: false, message: `Approval for ${traceId} is already ${request.status}` };
    }

    let role = "web-admin";
    if (!bypassChecks) {
        // RBAC: reject also requires minimum role for HIGH+ operations
        role = getActiveUserRole();
        const canReject = !(role === "junior" && request.riskScore >= CONFIG.HIGH_RISK_THRESHOLD);
        if (!canReject) {
            return {
                success: false,
                message:
                    `[RBAC] Reject denied: Risk score ${request.riskScore}/100 operations cannot be rejected by '${role}'. ` +
                    "Minimum role required to reject is 'developer'. Set MCP_USER_ROLE env var."
            };
        }
    }

    request.status = "REJECTED";
    try {
        AtabeyStorage.updateApprovalStatus(traceId, "REJECTED");
    } catch { /* ignore */ }

    // Update Hermes message status
    const messages = AtabeyStorage.getPendingMessages();
    const pendingMsgs = messages.filter(
        m => m.traceId === traceId && m.category === "ALERT" && m.status === "PENDING"
    );
    for (const msg of pendingMsgs) {
        if (msg.id !== undefined) {
            AtabeyStorage.updateMessageStatus(msg.id as number, "REJECTED");
        }
    }

    return { success: true, message: `Operation ${traceId} rejected by '${role}'.` };
}

/**
 * Get all pending approval requests.
 */
export function getPendingApprovals(): ApprovalRequest[] {
    const now = Date.now();
    const pending: ApprovalRequest[] = [];

    // Sync from database
    try {
        const dbPending = AtabeyStorage.getPendingApprovals();
        for (const req of dbPending) {
            if (!activeApprovals.has(req.traceId)) {
                activeApprovals.set(req.traceId, req as ApprovalRequest);
            }
        }
    } catch { /* ignore */ }

    // Clean expired
    for (const [, request] of activeApprovals) {
        if (request.status === "PENDING" && now > request.expiresAt) {
            request.status = "EXPIRED";
            try {
                AtabeyStorage.updateApprovalStatus(request.traceId, "EXPIRED");
            } catch { /* ignore */ }
        }
        if (request.status === "PENDING") {
            pending.push(request);
        }
    }

    return pending;
}

/**
 * Get HITL config.
 */
export function getHumanInLoopConfig(): typeof CONFIG {
    return { ...CONFIG };
}

export { CONFIG as HumanInLoopConfig };
