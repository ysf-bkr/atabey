import fs from "fs";
import crypto from "crypto";
import { safePath } from "atabey-mcp/utils/security.js";
import { ReadFileArgs, ToolResult } from "../types.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { verifyReadPermission } from "atabey-mcp/utils/permissions.js";

/**
 * Session-scoped content-hash cache: repeated full reads of an unchanged file
 * return a compact notice instead of the full body (token economy).
 */
const readCache = new Map<string, { hash: string }>();

/** Test helper — clears the read cache. */
export function clearReadCache(): void {
    readCache.clear();
}

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

        // [TOKEN ECONOMY] File-hash guard: if this exact file was fully read
        // before in this session and is unchanged, return a compact notice.
        const hash = crypto.createHash("sha1").update(content).digest("hex");
        const cached = readCache.get(filePath);
        if (!args.force && cached?.hash === hash) {
            const note = `[CACHE HIT] File '${args.path}' is unchanged since your last full read in this session ` +
                `(${lines.length} lines, sha1 ${hash.slice(0, 8)}). Content omitted to save tokens — ` +
                `reuse your earlier view, or call read_file with force:true.`;
            Metrics.logUsage(projectRoot, "@mcp", `read_file(cache): ${args.path}`, Metrics.estimateTokens(note));
            return { content: [{ type: "text", text: note }] };
        }
        readCache.set(filePath, { hash });

        return { content: [{ type: "text", text: content }] };
    } catch (e) {
        const err = `Failed to read file: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", `read_file:${args.path}`, err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }
}
