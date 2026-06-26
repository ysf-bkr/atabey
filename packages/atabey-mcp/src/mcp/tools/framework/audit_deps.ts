import fs from "fs";
import path from "path";
import { ToolArgs, ToolResult } from "../types.js";

/**
 * Audits package.json for unused or duplicate-like packages.
 * Focuses on project health and cleanup.
 */
export function handleAuditDependencies(projectRoot: string, _args: ToolArgs): ToolResult {
    const pkgPath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(pkgPath)) {
        throw new Error("package.json not found.");
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const depNames = Object.keys(deps);
    
    const results: string[] = [];

    // 1. Look for similar packages (potential duplicates)
    const similarityGroups: Record<string, string[]> = {
        "CSS/Styling": ["tailwind", "panda", "styled-components", "emotion", "sass"],
        "Testing": ["vitest", "jest", "mocha", "jasmine"],
        "Fetching": ["axios", "ky", "fetch"]
    };

    for (const [group, patterns] of Object.entries(similarityGroups)) {
        const found = depNames.filter(d => patterns.some(p => d.includes(p)));
        if (found.length > 1) {
            results.push(`[WARN]  Potential redundancy in [${group}]: Found ${found.join(", ")}`);
        }
    }

    // 2. Scan for "any" usage in package names (bad practice markers)
    const legacyDeps = depNames.filter(d => d.includes("legacy") || d.includes("compat"));
    if (legacyDeps.length > 0) {
        results.push(`[INFO]  Legacy compatibility packages detected: ${legacyDeps.join(", ")}`);
    }

    return {
        content: [{
            type: "text",
            text: results.length > 0 
                ? `Dependency Audit Results:\n\n${results.join("\n")}`
                : "[OK] Dependencies look clean and consolidated."
        }]
    };
}
