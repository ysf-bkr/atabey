import fs from "fs";
import path from "path";
import { safePath } from "atabey-mcp/utils/security.js";
import { ListDirArgs, ToolResult } from "../types.js";
import { verifyReadPermission } from "atabey-mcp/utils/permissions.js";

/**
 * Lists the contents of a directory.
 */
export function handleListDir(projectRoot: string, args: ListDirArgs): ToolResult {
    try {
        const dirPath = safePath(projectRoot, args.path || ".");
        
        // ENFORCE READ PERMISSION MATRIX FOR DIRECTORY
        verifyReadPermission(projectRoot, path.join(args.path || ".", "placeholder"));
        
        if (!fs.existsSync(dirPath)) {
            return { isError: true, content: [{ type: "text", text: `[ERROR] Directory not found: ${args.path}` }] };
        }

        const stats = fs.statSync(dirPath);
        if (!stats.isDirectory()) {
            return { isError: true, content: [{ type: "text", text: `[ERROR] Path is not a directory: ${args.path}` }] };
        }

        const files = fs.readdirSync(dirPath);
        const results = files.map(file => {
            const fullPath = path.join(dirPath, file);
            let isDir = false;
            try {
                isDir = fs.lstatSync(fullPath).isDirectory();
            } catch {
                // Ignore broken symlinks or inaccessible files
            }
            return `${isDir ? "[DIR] " : "      "}${file}`;
        });

        return {
            content: [{
                type: "text",
                text: `Directory listing for ${args.path || "."}:\n\n${results.join("\n")}`
            }]
        };
    } catch (err) {
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${String(err)}` }] };
    }
}
