import { ToolResult } from "../types.js";
import { Storage } from "../../../shared/storage.js";

interface DeleteKnowledgeArgs {
    query?: string;
    category?: "ARCHITECTURE" | "DECISION" | "CODE_SNIPPET" | "RULE" | "TASK_HISTORY";
    id?: string;
}

export async function handleDeleteKnowledge(root: string, args: DeleteKnowledgeArgs): Promise<ToolResult> {
    try {
        const db = Storage.getDB();
        
        if (args.id) {
            const info = db.prepare("DELETE FROM vector_memory WHERE id = ?").run(args.id);
            if (info.changes > 0) {
                return { content: [{ type: "text", text: `[SUCCESS] Knowledge entry '${args.id}' deleted from Core Memory.` }] };
            }
            return { content: [{ type: "text", text: `[INFO] No entry found with ID '${args.id}'.` }] };
        }

        if (args.category) {
            const info = db.prepare("DELETE FROM vector_memory WHERE category = ?").run(args.category);
            return { content: [{ type: "text", text: `[SUCCESS] Purged ${info.changes} entries from category '${args.category}'.` }] };
        }

        return {
            isError: true,
            content: [{ type: "text", text: "[ERROR] You must provide either an 'id' or a 'category' to delete knowledge." }]
        };

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Failed to delete knowledge: ${message}` }]
        };
    }
}
