import { ContextAssembler, formatContextBundle } from "atabey/src/modules/memory/context-assembler.js";
import type { GetTaskContextArgs } from "../schemas.js";
import { ToolResult } from "../types.js";

/**
 * MCP Tool: get_task_context
 *
 * Returns a small, targeted context bundle for a task by querying the CodeGraph
 * and reading only the matched symbol line ranges — so the host AI does NOT
 * need to scan the whole repository. Requires `atabey index` to have run.
 */
export function handleGetTaskContext(projectRoot: string, args: GetTaskContextArgs): ToolResult {
    try {
        const task = String(args.task || "").trim();
        if (task.length < 3) {
            return { isError: true, content: [{ type: "text", text: "Missing or too-short 'task' argument." }] };
        }

        const bundle = ContextAssembler.assemble(projectRoot, task, {
            maxSymbols: args.maxSymbols ?? 10,
            maxSnippetLines: 60,
        });

        return { content: [{ type: "text", text: formatContextBundle(bundle) }] };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: `[CONTEXT] Error: ${(e as Error).message}` }] };
    }
}
