import { ToolResult } from "../types.js";
import { CoreMemory } from "atabey/src/modules/memory/core.js";
import { MemoryCategory } from "atabey/src/modules/memory/types.js";

interface SearchKnowledgeArgs {
    query: string;
    category?: "ARCHITECTURE" | "DECISION" | "CODE_SNIPPET" | "RULE" | "TASK_HISTORY";
    limit?: number;
}

export async function handleSearchKnowledge(root: string, args: SearchKnowledgeArgs): Promise<ToolResult> {
    try {
        await CoreMemory.init();
        const results = await CoreMemory.recall(args.query, {
            category: args.category as MemoryCategory,
            limit: args.limit
        });

        if (results.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "[INFO] No relevant knowledge found."
                }]
            };
        }

        const output = results.map(r => {
            const meta = r.entry.metadata;
            return `---
ID: ${r.entry.id}
Score: ${r.score.toFixed(4)}
Category: ${meta.category}
Tags: ${meta.tags.join(", ") || "none"}
File: ${meta.filePath || "N/A"}
Trace: ${meta.traceId || "N/A"}

Content:
${r.entry.content}
`;
        }).join("\n");

        return {
            content: [{
                type: "text",
                text: `[SUCCESS] Found ${results.length} relevant entries:\n\n${output}`
            }]
        };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            isError: true,
            content: [{
                type: "text",
                text: `[ERROR] Search failed: ${message}`
            }]
        };
    }
}
