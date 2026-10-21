/**
 * Hermes inter-agent message queue persistence.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { maskText } from "../security/pii.js";
import { asAgentID, asMessageID } from "../primitives/types.js";
import type { TaskID, TraceID } from "../primitives/types.js";
import type { MessageRow, MessageDbRow } from "./types.js";
import { StorageAgents } from "./agents.js";

export class StorageMessages extends StorageAgents {
    public static onMessageSaved: ((msg: { traceId: string; category: string }) => void) | null = null;

    public static onMessageStatusUpdated: ((id: number, status: string) => void) | null = null;

    public static saveMessage(msg: MessageRow) {
        const from = msg.from.replace("@", "");
        const to = msg.to.replace("@", "");
        const cleanContent = maskText(msg.content);

        this.getDB().prepare(`
            INSERT INTO messages (timestamp, sender, receiver, category, content, trace_id, parent_id, status, priority, requires_approval)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            msg.timestamp,
            from,
            to,
            msg.category,
            cleanContent,
            msg.traceId,
            msg.parentId || null,
            msg.status,
            msg.priority,
            msg.requiresApproval ? 1 : 0
        );

        if (this.onMessageSaved) {
            try { this.onMessageSaved({ traceId: msg.traceId, category: msg.category }); }
            catch (err) { logger.debug(`onMessageSaved hook error: ${(err as Error).message}`); }
        }
    }

    public static getPendingMessages(): MessageRow[] {
        const db = this.getDB();
        const rows = db.prepare("SELECT * FROM messages WHERE status = 'PENDING'").all() as MessageDbRow[];
        return rows.map(r => ({
            id: asMessageID(r.id),
            timestamp: r.timestamp,
            from: asAgentID(r.sender),
            to: asAgentID(r.receiver),
            category: r.category,
            content: maskText(r.content),
            traceId: r.trace_id as TraceID,
            parentId: (r.parent_id as TaskID) || undefined,
            status: r.status,
            priority: r.priority,
            requiresApproval: r.requires_approval === 1
        }));
    }

    public static updateMessageStatus(id: number, status: string) {
        this.getDB().prepare("UPDATE messages SET status = ? WHERE id = ?").run(status, id);
        if (this.onMessageStatusUpdated) {
            try { this.onMessageStatusUpdated(id, status); }
            catch (err) { logger.debug(`onMessageStatusUpdated hook error: ${(err as Error).message}`); }
        }
    }
}
