import { ToolResult } from "../types.js";
import { CoreMemory } from "atabey-mcp/../modules/memory/core.js";
import { MemoryCategory } from "atabey-mcp/../modules/memory/types.js";
import { asTraceID } from "atabey-mcp/../shared/types.js";

interface StoreKnowledgeArgs {
    content: string;
    category: "ARCHITECTURE" | "DECISION" | "CODE_SNIPPET" | "RULE" | "TASK_HISTORY";
    tags?: string[];
    filePath?: string;
    traceId?: string;
}

export async function handleStoreKnowledge(root: string, args: StoreKnowledgeArgs): Promise<ToolResult> {
    try {
        await CoreMemory.init();
        const id = await CoreMemory.remember({
            content: args.content,
            category: args.category as MemoryCategory,
            tags: args.tags,
            filePath: args.filePath,
            traceId: args.traceId ? asTraceID(args.traceId) : undefined
        });

        return {
            content: [{
                type: "text",
                text: `[SUCCESS] Knowledge stored with ID: ${id}`
            }]
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            isError: true,
            content: [{
                type: "text",
                text: `[ERROR] Failed to store knowledge: ${message}`
            }]
        };
    }
}
