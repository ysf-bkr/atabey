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

import { AtabeyStorage } from "../../../src/shared/storage.js";
import { asAgentID, asTraceID } from "../../../src/shared/types.js";

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
};

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
export function createApprovalRequest(
    traceId: string,
    toolName: string,
    agent: string,
    riskScore: number,
    reason: string,
    args: Record<string, unknown>
): { request: ApprovalRequest; message: string } {
    const now = Date.now();

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
    };

    activeApprovals.set(traceId, request);

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
        "Ask your AI assistant to call the approve_operation tool:",
        "",
        `  To approve: approve_operation { "action": "approve", "traceId": "${traceId}" }`,
        `  To reject:  approve_operation { "action": "reject",  "traceId": "${traceId}" }`,
        "  To list:    approve_operation { \"action\": \"list\" }",
        "─────────────────────────────────────────────────────────────",
        "",
        `Alternative: atabey hitl answer "${traceId}:approve" in your terminal.`,
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
    const request = activeApprovals.get(traceId);
    if (!request) return null;

    // Check if expired
    if (Date.now() > request.expiresAt) {
        request.status = "EXPIRED";
        return request;
    }

    return request;
}

/**
 * Approve a pending operation.
 */
export function approveOperation(traceId: string): { success: boolean; message: string } {
    const request = activeApprovals.get(traceId);
    if (!request) {
        return { success: false, message: `No pending approval found for trace: ${traceId}` };
    }

    if (request.status !== "PENDING") {
        return { success: false, message: `Approval for ${traceId} is already ${request.status}` };
    }

    request.status = "APPROVED";

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

    return { success: true, message: `Operation ${traceId} approved. You may retry.` };
}

/**
 * Reject a pending operation.
 */
export function rejectOperation(traceId: string): { success: boolean; message: string } {
    const request = activeApprovals.get(traceId);
    if (!request) {
        return { success: false, message: `No pending approval found for trace: ${traceId}` };
    }

    if (request.status !== "PENDING") {
        return { success: false, message: `Approval for ${traceId} is already ${request.status}` };
    }

    request.status = "REJECTED";

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

    return { success: true, message: `Operation ${traceId} rejected.` };
}

/**
 * Get all pending approval requests.
 */
export function getPendingApprovals(): ApprovalRequest[] {
    const now = Date.now();
    const pending: ApprovalRequest[] = [];

    // Clean expired
    for (const [, request] of activeApprovals) {
        if (request.status === "PENDING" && now > request.expiresAt) {
            request.status = "EXPIRED";
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
