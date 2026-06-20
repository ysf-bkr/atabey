import { safeExec } from "../../utils/cli.js";
import { UpdateProjectMemoryArgs, ToolResult } from "../types.js";

export function handleUpdateProjectMemory(projectRoot: string, args: UpdateProjectMemoryArgs): ToolResult {
    const section = args.section;
    const content = args.content;
    // Using execFileSync with array args prevents command injection
    safeExec("npx", ["atabey", "update_project_memory", section, content], projectRoot);
    return { content: [{ type: "text", text: `[OK] Section ${section} updated.` }] };
}
