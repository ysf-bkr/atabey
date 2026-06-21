import fs from "fs";
import { safePath } from "../../utils/security.js";
import { ReadFileArgs, ToolResult } from "../types.js";
import { Metrics } from "../../utils/metrics.js";
import { verifyReadPermission } from "../../utils/permissions.js";

export function handleReadFile(projectRoot: string, args: ReadFileArgs): ToolResult {
    if (!args.path) {
        const err = "Missing 'path' argument.";
        Metrics.logError(projectRoot, "@mcp", "read_file", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    try {
        const filePath = safePath(projectRoot, args.path);

        // ENFORCE READ PERMISSION MATRIX
        // Checked before file existence to avoid leaking path information
        // to agents without read access (Claude Code, Cursor, Gemini CLI, etc.)
        verifyReadPermission(projectRoot, args.path);

        if (!fs.existsSync(filePath)) {
            const err = `File not found: ${args.path}`;
            Metrics.logError(projectRoot, "@mcp", "read_file", err);
            return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
        }

        const startLine = args.startLine;
        const endLine = args.endLine;

        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        
        if (startLine !== undefined || endLine !== undefined) {
            const start = startLine !== undefined ? Math.max(1, startLine) - 1 : 0;
            const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
            const sliced = lines.slice(start, end).join("\n");
            const tokens = Metrics.estimateTokens(sliced);
            Metrics.logUsage(projectRoot, "@mcp", `read_file: ${args.path}`, tokens);
            return { content: [{ type: "text", text: sliced }] };
        }

        // ENFORCE TOKEN ECONOMY: Hard Limit for large files
        const HARD_LIMIT_LINES = 300;
        if (lines.length > HARD_LIMIT_LINES && (startLine === undefined || endLine === undefined)) {
            const errMsg = `[TOKEN ECONOMY GUARD] File '${args.path}' is too large (${lines.length} lines). To prevent context overflow and token waste, you MUST provide both 'startLine' and 'endLine' parameters to read specific sections of this file.`;
            Metrics.logError(projectRoot, "@mcp", `read_file: ${args.path} (blocked)`, errMsg);
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `[ERROR] ${errMsg}`
                }]
            };
        }

        const tokens = Metrics.estimateTokens(content);
        Metrics.logUsage(projectRoot, "@mcp", `read_file: ${args.path}`, tokens);
        return { content: [{ type: "text", text: content }] };
    } catch (e) {
        const err = `Failed to read file: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", `read_file:${args.path}`, err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }
}
