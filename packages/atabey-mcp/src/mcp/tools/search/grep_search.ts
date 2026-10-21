import fs from "fs";
import path from "path";
import { GrepSearchArgs, ToolResult } from "../types.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { verifyReadPermission } from "atabey-mcp/utils/permissions.js";
import { logger } from "../../../shared/logger.js";

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
    let searchRegex: RegExp;
    try {
        searchRegex = new RegExp(pattern);
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
                if (file === ".git" || file === "node_modules" || file === "dist" || file === "coverage") {
                    continue;
                }
                const filePath = path.join(dir, file);
                if (excludePattern && filePath.includes(excludePattern)) {
                    continue;
                }
                let stat: fs.Stats;
                try {
                    stat = fs.lstatSync(filePath);
                } catch {
                    continue;
                }
                if (stat.isDirectory()) {
                    walk(filePath);
                } else if (stat.isFile()) {
                    if (includePattern && !filePath.endsWith(includePattern)) {
                        continue;
                    }
                    if (stat.size > 2 * 1024 * 1024) {
                        continue; // Skip files larger than 2MB to prevent memory bloat
                    }
                    try {
                        verifyReadPermission(projectRoot, filePath);
                        const content = fs.readFileSync(filePath, "utf8");
                        if (searchRegex.test(content)) {
                            if (results.length < 30) {
                                results.push(filePath);
                            }
                        }
                    } catch (err) {
                        logger.debug("Skipping file without read permission during grep search", err);
                    }
                }
            }
        } catch (err) {
            logger.debug("Skipping unreadable directory during grep search", err);
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
