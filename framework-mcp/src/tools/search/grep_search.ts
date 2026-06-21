import fs from "fs";
import path from "path";
import { GrepSearchArgs, ToolResult } from "../types.js";
import { Metrics } from "../../utils/metrics.js";
import { verifyReadPermission } from "../../utils/permissions.js";

/**
 * Searches for a regex pattern within files in the project.
 */
export function handleGrepSearch(projectRoot: string, args: GrepSearchArgs): ToolResult {
    const pattern = args.pattern as string;
    const includePattern = args.includePattern as string || ""; // e.g., ".ts"
    const excludePattern = args.excludePattern as string || "node_modules";

    if (!pattern) {
        const err = "Search pattern is required.";
        Metrics.logError(projectRoot, "@mcp", "grep_search", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    const results: string[] = [];
    try {
        new RegExp(pattern);
    } catch (e) {
        const err = `Invalid regex pattern: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", "grep_search", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    const walk = (dir: string) => {
        if (results.length >= 30) return;
        try {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                if (results.length >= 30) return;
                const filePath = path.join(dir, file);
                if (excludePattern && filePath.includes(excludePattern)) {
                    continue;
                }
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    walk(filePath);
                } else if (stat.isFile()) {
                    if (includePattern && !filePath.endsWith(includePattern)) {
                        continue;
                    }
                    try {
                        verifyReadPermission(projectRoot, filePath);
                        const content = fs.readFileSync(filePath, "utf8");
                        if (new RegExp(pattern).test(content)) {
                            if (results.length < 30) {
                                results.push(filePath);
                            }
                        }
                    } catch {
                        // Silently skip files without read permissions
                    }
                }
            }
        } catch {
            // Ignore directories that cannot be read
        }
    };
    try {
        walk(projectRoot);
    } catch (e) {
        const err = `Search failed: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", "grep_search", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    let responseText = results.length > 0
        ? `Found ${results.length} matches:\n\n${results.join("\n")}`
        : "No matches found.";
    
    if (results.length >= 30) {
        responseText += "\n\n[TOKEN ECONOMY GUARD] Search truncated at 30 matches to save tokens. Please use a more specific 'pattern' or 'includePattern'.";
    }

    return {
        content: [{
            type: "text",
            text: responseText
        }]
    };
}
