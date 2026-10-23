import { ToolResult } from "../types.js";
import { updateProjectMemory } from "atabey/src/cli/utils/memory.js";
import { UpdateProjectMemoryArgs } from "../types.js";

/**
 * Updates a section of the project's central memory (PROJECT_MEMORY.md + SQLite SSOT).
 *
 * [FIX] Calls the in-process memory API instead of shelling out to a CLI
 * subcommand that did not exist (`atabey update_project_memory` — the real
 * command is `atabey memory update`). The old shell-out failed silently and
 * reported success while writing nothing.
 */
export function handleUpdateProjectMemory(_projectRoot: string, args: UpdateProjectMemoryArgs): ToolResult {
    try {
        updateProjectMemory(args.section, args.content);
        return { content: [{ type: "text", text: `[OK] Section ${args.section} updated.` }] };
    } catch (e) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to update project memory: ${String(e)}` }],
        };
    }
}
