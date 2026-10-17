import http from "http";
import { RouteContext, serveJson, parseJsonBody } from "./types.js";
import { Storage } from "../../shared/storage.js";
import { maskText } from "../../shared/pii.js";

export async function handleOrchestratorRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: RouteContext
): Promise<boolean> {
    const { broadcastWS } = context;

    // Messages (Hermes queue)
    if (pathname === "/api/messages") {
        try {
            const messages = Storage.getPendingMessages();
            serveJson(res, 200, { success: true, data: messages });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Hermes Stats
    if (pathname === "/api/hermes/stats") {
        try {
            const messages = Storage.getPendingMessages();
            const totalMessages = Storage.getDB().prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
            const byCategory: Record<string, number> = {};
            const byStatus: Record<string, number> = {};
            messages.forEach(m => {
                byCategory[m.category] = (byCategory[m.category] || 0) + 1;
                byStatus[m.status] = (byStatus[m.status] || 0) + 1;
            });
            serveJson(res, 200, {
                success: true, data: {
                    total: totalMessages.count, pending: messages.length, byCategory, byStatus,
                    lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Tasks
    if (pathname === "/api/tasks") {
        try {
            const { asTraceID } = await import("../../shared/types.js");
            const traceId = params.traceId ? asTraceID(params.traceId) : undefined;
            const tasks = Storage.getTasks(traceId);
            const maskedTasks = tasks.map(t => ({
                ...t,
                description: maskText(t.description),
            }));
            serveJson(res, 200, { success: true, data: maskedTasks });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Logs
    if (pathname.startsWith("/api/logs")) {
        try {
            const logs = Storage.getLogs();
            const agent = pathname.split("/api/logs/")[1];
            const filteredLogs = agent ? logs.filter(l => l.agent === agent) : logs;
            serveJson(res, 200, { success: true, data: filteredLogs });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Approvals (Real Human-In-The-Loop gate from SQLite)
    if (pathname === "/api/approvals") {
        try {
            const { getPendingApprovals } = await import("../utils/human-in-loop.js");
            const realApprovals = getPendingApprovals();
            const data = realApprovals.map(a => ({
                id: a.traceId,
                traceId: a.traceId,
                actionTitle: `${a.toolName} (@${a.agent})`,
                toolName: a.toolName,
                agent: a.agent,
                riskScore: a.riskScore,
                riskLevel: a.riskLevel,
                riskSummary: a.reason,
                riskAssessment: `Risk score ${a.riskScore}/100 (${a.riskLevel})`,
                description: a.reason,
                status: a.status || "Pending",
                timestamp: new Date(a.createdAt).toISOString()
            }));
            serveJson(res, 200, { success: true, data });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Approve
    if (pathname.startsWith("/api/approve/") && method === "POST") {
        const traceId = pathname.replace("/api/approve/", "");
        if (!traceId) { serveJson(res, 400, { success: false, error: "Trace ID required" }); return true; }
        try {
            const body = await parseJsonBody<{ passcode?: string }>(req).catch(() => ({} as { passcode?: string }));
            const { approveOperation } = await import("../utils/human-in-loop.js");
            // No bypass: RBAC (MCP_USER_ROLE) + the stderr passcode second factor are enforced here too.
            const result = approveOperation(traceId, body.passcode, undefined, false);
            if (result.success) {
                broadcastWS("approval", { traceId, status: "APPROVED" });
                serveJson(res, 200, { success: true, message: result.message });
            } else {
                serveJson(res, 400, { success: false, error: result.message });
            }
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Reject
    if (pathname.startsWith("/api/reject/") && method === "POST") {
        const traceId = pathname.replace("/api/reject/", "");
        if (!traceId) { serveJson(res, 400, { success: false, error: "Trace ID required" }); return true; }
        try {
            const { rejectOperation } = await import("../utils/human-in-loop.js");
            const result = rejectOperation(traceId, undefined, false);
            if (result.success) {
                broadcastWS("approval", { traceId, status: "REJECTED" });
                serveJson(res, 200, { success: true, message: result.message });
            } else {
                serveJson(res, 400, { success: false, error: result.message });
            }
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    return false;
}
