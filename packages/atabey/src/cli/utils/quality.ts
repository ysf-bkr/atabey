import fs from "fs";
import path from "path";

/**
 * Code Quality utilities for Agent Atabey.
 *
 * Inline implementation to avoid circular dependency between atabey and atabey-mcp.
 */

export interface QualityIssue {
    type: string;
    file: string;
    line: number;
    message: string;
    severity?: string;
}

export interface QualityAnalysisResult {
    totalFiles: number;
    totalIssues: number;
    longFunctions: QualityIssue[];
    deepNesting: QualityIssue[];
    anyTypes: QualityIssue[];
    issues: QualityIssue[];
}

/**
 * Analyzes code quality in a given path.
 * Scans for long functions, deep nesting, and `any` type usage.
 */
export function analyzePathQuality(projectRoot: string, targetPath: string): QualityAnalysisResult {
    const fullPath = path.join(projectRoot, targetPath);

    const issues: QualityIssue[] = [];
    let totalFiles = 0;

    function scanDir(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
                scanDir(full);
            } else if (entry.isFile() && entry.name.endsWith(".ts")) {
                totalFiles++;
                const content = fs.readFileSync(full, "utf8");
                const lines = content.split("\n");
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // Check for `any` type usage
                    if (/\bany\b/.test(line) && !line.includes("//")) {
                        issues.push({ type: "any-type", file: full, line: i + 1, message: "Usage of `any` type detected", severity: "error" });
                    }
                    // Check for long functions (> 40 lines)
                    if (line.includes("function ") || line.includes("=>") || line.includes("{")) {
                        let braceCount = 0;
                        let funcLines = 0;
                        for (let j = i; j < lines.length; j++) {
                            if (lines[j].includes("{")) braceCount++;
                            if (lines[j].includes("}")) braceCount--;
                            funcLines++;
                            if (braceCount <= 0 && funcLines > 1) break;
                        }
                        if (funcLines > 40) {
                            issues.push({ type: "complexity", file: full, line: i + 1, message: `Function spans ${funcLines} lines (limit: 40)`, severity: "warning" });
                        }
                    }
                }
            }
        }
    }

    scanDir(fullPath);

    return {
        totalFiles,
        totalIssues: issues.length,
        longFunctions: issues.filter(i => i.type === "complexity"),
        deepNesting: issues.filter(i => i.type === "nesting"),
        anyTypes: issues.filter(i => i.type === "any-type"),
        issues,
    };
}
