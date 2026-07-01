import http from "http";
import fs from "fs";
import path from "path";
import { RouteContext, serveJson, serveFile } from "./types.js";
import { Storage } from "../../shared/storage.js";
import { maskText } from "../../shared/pii.js";

export async function handleCommonRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: RouteContext
): Promise<boolean> {
    const { serverVersion, FRAMEWORK_DIR } = context;

    // Health
    if (pathname === "/api/health") {
        serveJson(res, 200, { status: "healthy", version: serverVersion, frameworkDir: FRAMEWORK_DIR });
        return true;
    }

    // Status
    if (pathname === "/api/status") {
        const statusPath = path.join(FRAMEWORK_DIR, "memory", "status.json");
        if (fs.existsSync(statusPath)) {
            serveFile(res, statusPath, "application/json");
            return true;
        }
        serveJson(res, 200, { success: true, data: { status: "initializing" } });
        return true;
    }

    // Memory (PROJECT_MEMORY.md)
    if (pathname === "/api/memory") {
        const memoryPath = path.join(FRAMEWORK_DIR, "memory", "PROJECT_MEMORY.md");
        if (fs.existsSync(memoryPath)) {
            serveFile(res, memoryPath, "text/markdown");
            return true;
        }
        serveJson(res, 200, { success: true, data: "No memory file yet." });
        return true;
    }

    // Memory Search
    if (pathname === "/api/memory/search") {
        try {
            const query = params.q || "";
            const limit = parseInt(params.limit || "10", 10);
            if (!query) {
                const db = Storage.getDB();
                const rows = db.prepare("SELECT * FROM vector_memory ORDER BY created_at DESC LIMIT ?").all(limit) as Array<{
                    id: string; content: string; category: string; metadata: string; created_at: string;
                }>;
                const results = rows.map(row => {
                    const meta = JSON.parse(row.metadata || "{}");
                    return { id: row.id, content: maskText(row.content), type: row.category || meta.category || "memory", timestamp: meta.createdAt || row.created_at, relevance: 1.0 };
                });
                serveJson(res, 200, { success: true, data: results });
                return true;
            }
            const { CoreMemory } = await import("atabey/src/modules/memory/core.js");
            const results = await CoreMemory.recall(query, { limit });
            const flattened = results.map(r => ({
                id: r.entry.id, content: maskText(r.entry.content), type: r.entry.metadata.category || "memory",
                timestamp: r.entry.metadata.createdAt || new Date().toISOString(), relevance: r.score
            }));
            serveJson(res, 200, { success: true, data: flattened });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    return false;
}
