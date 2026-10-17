import { Storage } from "atabey-mcp/utils/storage.js";
import { ToolArgs, ToolResult } from "../types.js";

/**
 * Extracts key insights from the SQLite database to minimize token usage.
 * Returns only the active phase, trace, and the last 5 decisions/tasks.
 */
export function handleGetMemoryInsights(_projectRoot: string, _args: ToolArgs): ToolResult {
    try {
        const activePhase = Storage.getMetadata("phase") || "PHASE_0";
        const activeTrace = Storage.getMetadata("traceId") || "None";
        
        // Get the last 5 logs from SQLite
        const recentLogs = Storage.getLogs().slice(0, 5);
        let recentHistory = "No history found.";
        
        if (recentLogs.length > 0) {
            recentHistory = recentLogs.map(log => 
                `- [${log.agent}] ${log.action}: ${log.summary}`
            ).join("\n");
        }

        const insights = `[MEMORY] **Memory Insights**\n- **Phase:** ${activePhase}\n- **Trace:** ${activeTrace}\n\n**Recent Actions:**\n${recentHistory}`;
        
        return { content: [{ type: "text", text: insights }] };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Failed to extract insights: ${String(e)}` }] };
    }
}
