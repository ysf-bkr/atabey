import fs from "fs";
import path from "path";
import { safePath } from "../../utils/security.js";
import { GetProjectGapsArgs, ToolResult } from "../types.js";

/**
 * Scans the codebase for TODOs, FIXMEs, and empty function bodies.
 * Helps identify what's left and where the agent might have skipped logic.
 */
export function handleGetProjectGaps(projectRoot: string, args: GetProjectGapsArgs): ToolResult {
    const srcDir = safePath(projectRoot, args.path || "src");
    const results: string[] = [];

    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const relativePath = path.relative(projectRoot, fullPath);

            if (fs.statSync(fullPath).isDirectory()) {
                if (file !== "node_modules" && file !== "dist" && !file.startsWith(".")) {
                    walk(fullPath);
                }
            } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
                const content = fs.readFileSync(fullPath, "utf8");
                const lines = content.split("\n");

                lines.forEach((line, index) => {
                    // 1. Scan for markers
                    if (line.includes("TODO") || line.includes("FIXME") || line.includes("!!!")) {
                        results.push(`[${relativePath}:${index + 1}] Marker found: ${line.trim()}`);
                    }
                    
                    // 2. Scan for empty function placeholders (heuristic)
                    if (line.includes("throw new Error(\"Not implemented") || line.includes("// ... rest of code")) {
                        results.push(`[${relativePath}:${index + 1}] Gap found: ${line.trim()}`);
                    }
                });
            }
        }
    };

    walk(srcDir);

    return {
        content: [{
            type: "text",
            text: results.length > 0 
                ? `Found ${results.length} gaps/todos:\n\n${results.join("\n")}`
                : "[OK] No major gaps or TODOs found in the scanned directory."
        }]
    };
}
