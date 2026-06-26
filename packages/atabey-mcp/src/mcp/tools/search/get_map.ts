import fs from "fs";
import path from "path";
import { GetProjectMapArgs, ToolResult } from "../types.js";

/**
 * Generates a tree-view map of the project structure.
 * Helps agents visualize the entire project layout quickly.
 */
export function handleGetProjectMap(projectRoot: string, args: GetProjectMapArgs): ToolResult {
    const maxDepth = args.maxDepth || 3;
    const includeFiles = args.includeFiles !== false;

    const buildTree = (dir: string, depth: number): string[] => {
        if (depth > maxDepth) return [];

        const results: string[] = [];
        const files = fs.readdirSync(dir);

        files.forEach(file => {
            if (file === "node_modules" || file === ".git" || file === "dist" || file.startsWith(".")) return;

            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            const indent = "  ".repeat(depth);

            if (stat.isDirectory()) {
                results.push(`${indent}📁 ${file}/`);
                results.push(...buildTree(fullPath, depth + 1));
            } else if (includeFiles) {
                results.push(`${indent}[FILE] ${file}`);
            }
        });

        return results;
    };

    try {
        const tree = buildTree(projectRoot, 0);
        return {
            content: [{
                type: "text",
                text: `[MAP] **Project Map (Depth: ${maxDepth})**\n\n${tree.join("\n")}`
            }]
        };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Failed to map project: ${String(e)}` }] };
    }
}
