import { normalizeAgentName } from "../utils/string.js";
import { Storage } from "../../shared/storage.js";

export async function logAgentActionCommand(data: { agent?: unknown; action?: string; requestId?: string; traceId?: string; status?: string; summary?: string; files?: string[]; details?: Record<string, unknown> }) {
    const agent = normalizeAgentName(data.agent);
    
    Storage.saveLog({
        agent,
        action: data.action || "ACTION",
        trace_id: data.traceId || undefined,
        status: data.status || "SUCCESS",
        summary: data.summary || "",
        findings: data.details ? JSON.stringify(data.details) : undefined
    });
}
