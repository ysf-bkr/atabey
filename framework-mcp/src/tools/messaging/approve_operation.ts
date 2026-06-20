import { approveOperation, rejectOperation, getPendingApprovals } from "../../utils/human-in-loop.js";
import { ToolResult } from "../types.js";

interface ApproveOperationArgs {
    action: "approve" | "reject" | "list";
    traceId?: string;
    reason?: string;
}

/**
 * ─── APPROVE OPERATION — In-Chat Risk Gate ──────────────────────────
 *
 * AI CLI kullanımında "atabey approve <traceId>" CLI komutu çalıştırmak mümkün
 * değildir — chat'e yazılan şey CLI komutu olarak değil mesaj olarak işlenir.
 *
 * Bu tool, risk gate approval flow'unu doğrudan MCP tool çağrısına taşır:
 *
 * 1. Atabey yüksek riskli bir operasyonu bloklar
 * 2. Geliştiriciye: "approve_operation tool'unu çağır" der
 * 3. AI bu tool'u çağırır → operasyon onaylanır/reddedilir
 *
 * Geliştirici terminale geçmek zorunda kalmaz.
 */
export async function handleApproveOperation(
    _root: string,
    args: ApproveOperationArgs
): Promise<ToolResult> {
    const { action, traceId, reason } = args;

    // LIST: Bekleyen approval'ları göster
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

    // APPROVE or REJECT: traceId zorunlu
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
