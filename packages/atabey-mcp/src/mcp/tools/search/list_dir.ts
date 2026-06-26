import fs from "fs";
import path from "path";
import { safePath } from "atabey-mcp/utils/security.js";
import { ListDirArgs, ToolResult } from "../types.js";
import { verifyReadPermission } from "atabey-mcp/utils/permissions.js";

/**
 * Lists the contents of a directory.
 */
export function handleListDir(projectRoot: string, args: ListDirArgs): ToolResult {
    const dirPath = safePath(projectRoot, args.path || ".");
    
    // ENFORCE READ PERMISSION MATRIX FOR DIRECTORY
    verifyReadPermission(projectRoot, path.join(args.path || ".", "placeholder"));
    
    if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${args.path}`);
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${args.path}`);
    }

    const files = fs.readdirSync(dirPath);
    const results = files.map(file => {
        const fullPath = path.join(dirPath, file);
        const isDir = fs.statSync(fullPath).isDirectory();
        return `${isDir ? "[DIR] " : "      "}${file}`;
    });

    return {
        content: [{
            type: "text",
            text: `Directory listing for ${args.path || "."}:\n\n${results.join("\n")}`
        }]
    };
}
