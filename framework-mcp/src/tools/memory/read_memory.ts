import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "../../utils/security.js";
import { ToolArgs, ToolResult } from "../types.js";

/**
 * Reads the project's central memory (PROJECT_MEMORY.md).
 * This is the "brain" of the project.
 */
export function handleReadProjectMemory(projectRoot: string, _args: ToolArgs): ToolResult {
    try {
        const frameworkDir = resolveFrameworkDir(projectRoot);
        const memoryPath = path.join(projectRoot, frameworkDir, "memory/PROJECT_MEMORY.md");

        if (!fs.existsSync(memoryPath)) {
            return {
                content: [{ type: "text", text: "[INFO] Project memory file not found. It might be a new project." }]
            };
        }

        const content = fs.readFileSync(memoryPath, "utf8");
        return {
            content: [{ type: "text", text: content }]
        };
    } catch (e) {
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to read project memory: ${String(e)}` }]
        };
    }
}
