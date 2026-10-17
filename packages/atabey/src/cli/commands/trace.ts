import { logger } from "../../shared/logger.js";
import { Storage } from "../../shared/storage.js";
import { stripMarkdownCodeBlocks } from "../../shared/string.js";
import { generateULID, getFrameworkDir, updateDocumentStore } from "../utils/memory.js";
import { normalizeAgentName, normalizePriority, sanitizeInput } from "../utils/string.js";
import { UI } from "../utils/ui.js";

/**
 * Generate a new Trace ID and add it to project memory.
 * Uses ULID format: 26-char Crockford Base32 (10 chars timestamp + 16 chars random)
 */
export async function traceNewCommand(description: string, agent = "manager", priority = "P2"): Promise<string | void> {
    const traceId = generateULID();
    const safeDescription = sanitizeInput(description);
    const safeAgent = normalizeAgentName(agent);
    const safePriority = normalizePriority(priority);
    const frameworkDir = getFrameworkDir();

    // --- Document Store Write (SQLite) ---
    updateDocumentStore("task", {
        traceId,
        description: safeDescription,
        agent: safeAgent,
        priority: safePriority,
        status: "IN_PROGRESS",
        createdAt: new Date().toISOString()
    }, traceId, frameworkDir);
    // ----------------------------

    // Update active trace in metadata
    Storage.setMetadata("traceId", traceId);

    logger.info(`New Trace ID created: ${traceId}`);
    UI.success(`New Trace ID created: ${traceId}`);
    UI.intent("TASK", `Added to task list: ${description}`);
    return traceId;
}

/**
 * Replay the chronological message exchanges of a specific Trace ID.
 * Reads from SQLite messages table instead of filesystem.
 */
export async function traceReplayCommand(traceId: string): Promise<void> {
    const { UI } = await import("../utils/ui.js");

    UI.intent("Trace Replay Engine", `Searching logs for Trace ID: ${traceId}...`);

    const events: Array<{
        timestamp: string;
        from: string;
        to: string;
        category: string;
        content: string;
        priority?: string;
    }> = [];

    // Read from SQLite messages table
    try {
        const db = Storage.getDB();
        const rows = db.prepare(
            "SELECT timestamp, sender, receiver, category, content, priority FROM messages WHERE trace_id = ? ORDER BY timestamp ASC"
        ).all(traceId) as Array<{
            timestamp: string;
            sender: string;
            receiver: string;
            category: string;
            content: string;
            priority: string;
        }>;

        for (const row of rows) {
            events.push({
                timestamp: row.timestamp,
                from: row.sender,
                to: row.receiver,
                category: row.category,
                content: row.content,
                priority: row.priority,
            });
        }
    } catch (err) {
        logger.debug("Failed to read from SQLite messages", err);
    }

    // Also read from logs table for agent actions
    try {
        const logs = Storage.getLogs();
        for (const log of logs) {
            if (log.trace_id === traceId) {
                events.push({
                    timestamp: log.timestamp,
                    from: log.agent,
                    to: "@manager",
                    category: "ACTION",
                    content: log.summary,
                });
            }
        }
    } catch (err) {
        logger.debug("Failed to read from SQLite logs", err);
    }

    if (events.length === 0) {
        UI.warning(`No message exchanges found for Trace ID: ${traceId}`);
        return;
    }

    // Sort chronologically by timestamp
    events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    const separatorLine = "=".repeat(80);
    process.stdout.write(`\n${separatorLine}\n`);
    process.stdout.write(`[TRACE TIMELINE REPLAY] ID: ${traceId}\n`);
    process.stdout.write(`${separatorLine}\n`);

    events.forEach(evt => {
        const timeStr = new Date(evt.timestamp).toLocaleTimeString();
        process.stdout.write(`[${timeStr}] ${evt.from} ➔ ${evt.to} [${evt.category}]\n`);
        try {
            const cleanedContent = stripMarkdownCodeBlocks(evt.content);
            const parsed = JSON.parse(cleanedContent);
            if (parsed.task) {
                process.stdout.write(`  💬 Task: ${parsed.task}\n`);
            } else {
                process.stdout.write(`  💬 Content: ${evt.content.substring(0, 200)}\n`);
            }
        } catch {
            process.stdout.write(`  💬 Content: ${evt.content.substring(0, 200)}\n`);
        }
    });

    process.stdout.write(`${separatorLine}\n`);
    UI.success(`Trace replay completed (${events.length} events).`);
}
