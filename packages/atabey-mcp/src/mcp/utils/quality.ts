import fs from "fs";
import path from "path";

export interface QualityIssue {
    file: string;
    line: number;
    type: "any-type" | "complexity";
    message: string;
}

export interface QualityAnalysisResult {
    totalFiles: number;
    totalIssues: number;
    longFunctions: number;
    deepNesting: number;
    anyTypes: number;
    issues: QualityIssue[];
}

/**
 * Shared Code Quality Heuristic Scanner
 * Evaluates functions lengths, nesting depth, and usage of the forbidden 'any' type.
 */
export function analyzePathQuality(projectRoot: string, targetPath: string): QualityAnalysisResult {
    const absolutePath = path.resolve(projectRoot, targetPath);
    const files: string[] = [];

    function collectFilesSync(dir: string, exts: string[]): void {
        if (!fs.existsSync(dir)) return;
        try {
            const stat = fs.statSync(dir);
            if (stat.isFile()) {
                if (exts.some(ext => dir.endsWith(ext))) {
                    files.push(dir);
                }
                return;
            }
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith("node_modules") && !entry.name.startsWith(".")) {
                    collectFilesSync(fullPath, exts);
                } else if (entry.isFile() && exts.some(ext => entry.name.endsWith(ext))) {
                    files.push(fullPath);
                }
            }
        } catch {
            // Ignore errors reading files/dirs
        }
    }

    collectFilesSync(absolutePath, [".ts", ".tsx"]);

    const issues: QualityIssue[] = [];
    let longFunctions = 0;
    let deepNesting = 0;
    let anyTypes = 0;

    files.forEach((f) => {
        try {
            const content = fs.readFileSync(f, "utf8");
            const lines = content.split("\n");
            const relativePath = path.relative(projectRoot, f);

            // Check for `any` type
            lines.forEach((line: string, idx: number) => {
                if (line.trim().startsWith("//") || line.trim().startsWith("/*")) return;
                if (line.match(/\bany\b/) && !line.includes("// eslint-disable") && !line.includes("as any")) {
                    anyTypes++;
                    issues.push({
                        file: relativePath,
                        line: idx + 1,
                        type: "any-type",
                        message: `Line ${idx + 1}: Usage of 'any' type`
                    });
                }
            });

            // Check for long functions
            let inFunction = false;
            let funcLines = 0;
            let startLine = 0;
            let funcName = "anonymous";

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // Detect function/method starts using regex
                const funcMatch = line.match(/(?:public|private|protected|static\s+)?(?:async\s+)?(?:function\s+)?(\w+)\s*\([^)]*\)\s*{/);
                const methodMatch = !funcMatch ? line.match(/^\s*(?:public|private|protected|static\s+)?(\w+)\s*\([^)]*\)\s*{/) : null;
                const arrowMatch = !funcMatch && !methodMatch ? line.match(/(?:const|let|var)?\s*(\w+)?\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*{/) : null;

                if (funcMatch || methodMatch || arrowMatch) {
                    inFunction = true;
                    funcLines = 1;
                    startLine = i + 1;
                    funcName = (funcMatch?.[1] || methodMatch?.[1] || arrowMatch?.[1] || "anonymous").trim();
                    continue;
                }

                if (inFunction) {
                    funcLines++;
                    if (line.includes("}")) {
                        if (funcLines > 50) {
                            longFunctions++;
                            issues.push({
                                file: relativePath,
                                line: startLine,
                                type: "complexity",
                                message: `Function '${funcName}' is ${funcLines} lines long (max: 50)`
                            });
                        }
                        inFunction = false;
                    }
                }
            }

            // Check nesting depth
            lines.forEach((line: string, idx: number) => {
                const leadingSpaces = line.match(/^(\s*)/)?.[0].length || 0;
                if (leadingSpaces >= 10 && !line.trim().startsWith("//") && !line.trim().startsWith("*")) {
                    const indentSize = (leadingSpaces % 4 === 0) ? 4 : 2;
                    const depth = Math.floor(leadingSpaces / indentSize);
                    if (depth > 4) {
                        deepNesting++;
                        issues.push({
                            file: relativePath,
                            line: idx + 1,
                            type: "complexity",
                            message: `Line ${idx + 1}: Nesting depth ${depth}`
                        });
                    }
                }
            });
        } catch {
            // Ignore files that can't be read
        }
    });

    return {
        totalFiles: files.length,
        totalIssues: issues.length,
        longFunctions,
        deepNesting,
        anyTypes,
        issues
    };
}
