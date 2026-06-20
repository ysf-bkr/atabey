import { normalizeAgentName } from "../utils/string.js";
import { Storage } from "../../shared/storage.js";

export async function logAgentActionCommand(data: { agent?: unknown; action?: string; requestId?: string; traceId?: string; status?: string; summary?: string; files?: string[]; details?: Record<string, unknown> }) {
    const agent = normalizeAgentName(data.agent);
    
    const db = Storage.getDB();
    db.prepare(`
        INSERT INTO logs (agent, action, trace_id, status, summary, findings)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        agent,
        data.action,
        data.traceId || null,
        data.status || "SUCCESS",
        data.summary || "",
        data.details ? JSON.stringify(data.details) : null
    );
}
