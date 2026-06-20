import { approveOperation, getPendingApprovals, rejectOperation } from "../../utils/human-in-loop.js";
import { ToolResult } from "../types.js";

interface ApproveOperationArgs {
    action: "approve" | "reject" | "list";
    traceId?: string;
    reason?: string;
}

/**
 * MCP Tool: approve_operation
 *
 * In AI CLI (Claude Code, Gemini CLI), running "atabey approve <traceId>"
 * is not possible — anything typed in chat is treated as a message, not a CLI command.
 *
 * This tool moves the risk gate approval flow directly into an MCP tool call:
 *
 * 1. Atabey blocks a high-risk operation
 * 2. Tells the developer: "call the approve_operation tool"
 * 3. AI calls this tool → operation is approved/rejected
 *
 * Developer never has to switch to terminal.
 */
export async function handleApproveOperation(
    _root: string,
    args: ApproveOperationArgs
): Promise<ToolResult> {
    const { action, traceId, reason } = args;

    // LIST: Show pending approvals
    if (action === "list") {
        const pending = getPendingApprovals();
        if (pending.length === 0) {
            return {
                content: [{ type: "text", text: "[APPROVALS] No pending operations waiting for approval." }],
            };
        }

        const lines = [
            `[APPROVALS] ${pending.length} pending operation(s):\n`,
            ...pending.map(req => [
                "  ─────────────────────────────────────",
                `  Trace ID:   ${req.traceId}`,
                `  Tool:       ${req.toolName}`,
                `  Agent:      ${req.agent}`,
                `  Risk Score: ${req.riskScore}/100 (${req.riskLevel})`,
                `  Reason:     ${req.reason}`,
                `  Expires:    ${new Date(req.expiresAt).toISOString()}`,
            ].join("\n")),
            "",
            "To approve: call approve_operation with action=\"approve\" and traceId=\"<id>\"",
            "To reject:  call approve_operation with action=\"reject\" and traceId=\"<id>\"",
        ];

        return {
            content: [{ type: "text", text: lines.join("\n") }],
        };
    }

    // APPROVE or REJECT: traceId is required
    if (!traceId) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] traceId is required for "${action}" action.` }],
        };
    }

    if (action === "approve") {
        const result = approveOperation(traceId);
        return {
            content: [{
                type: "text",
                text: result.success
                    ? `[APPROVED] ✅ ${result.message}\nYou may retry the blocked operation now.`
                    : `[ERROR] ${result.message}`,
            }],
            isError: !result.success,
        };
    }

    if (action === "reject") {
        const result = rejectOperation(traceId);
        return {
            content: [{
                type: "text",
                text: result.success
                    ? `[REJECTED] ⛔ ${result.message}${reason ? `\nReason: ${reason}` : ""}`
                    : `[ERROR] ${result.message}`,
            }],
            isError: !result.success,
        };
    }

    return {
        isError: true,
        content: [{ type: "text", text: `[ERROR] Unknown action: "${String(action)}". Use "approve", "reject", or "list".` }],
    };
}
