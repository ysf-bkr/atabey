import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import type { AnalyzeCodeQualityArgs } from "../schemas.js";
import { ToolResult } from "../types.js";
import { analyzePathQuality } from "atabey-mcp/utils/quality.js";
import { safePath } from "../../utils/security.js";

/** Walk up from `startDir` until `projectRoot` looking for a file/dir name. */
function findNearest(startDir: string, names: string[], projectRoot: string): string | null {
    let current = path.resolve(startDir);
    const root = path.resolve(projectRoot);
    while (current.startsWith(root)) {
        for (const name of names) {
            const candidate = path.join(current, name);
            if (fs.existsSync(candidate)) return candidate;
        }
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return null;
}

/**
 * Code quality analysis tool for Atabey MCP.
 *
 * Performs three checks on the provided source code:
 * - TypeScript type checking (checkTypes)
 * - Lint checking (checkLint)
 * - Code complexity analysis (checkComplexity)
 */
export function handleAnalyzeCodeQuality(projectRoot: string, args: AnalyzeCodeQualityArgs): ToolResult {
    // Validate path parameter to prevent command injection
    if (!/^[a-zA-Z0-9_./-]+$/.test(args.path)) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Invalid path characters detected: ${args.path}` }]
        };
    }

    let targetPath: string;
    try {
        targetPath = safePath(projectRoot, args.path);
    } catch (e) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] ${(e as Error).message}` }]
        };
    }

    if (!fs.existsSync(targetPath)) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Path does not exist: ${args.path}` }]
        };
    }

    const results: string[] = ["# Code Quality Analysis Report", "", `**Target:** ${args.path}`, `**Timestamp:** ${new Date().toISOString()}`, ""];
    let hasErrors = false;

    // 1. TypeScript Type Check
    if (args.checkTypes !== false) {
        try {
            // Use the tsconfig that owns the target path (consumer projects keep
            // it under apps/backend, not at the repository root).
            const tsconfigPath = findNearest(targetPath, ["tsconfig.json"], projectRoot);
            const tscArgs = tsconfigPath ? ["tsc", "-p", tsconfigPath, "--noEmit"] : ["tsc", "--noEmit"];
            execFileSync("npx", tscArgs, {
                cwd: projectRoot,
                stdio: "pipe",
                timeout: 30000,
                encoding: "utf8"
            });
            results.push("## ✅ TypeScript Check: PASSED");
            results.push("No type errors found.");
        } catch (err: unknown) {
            hasErrors = true;
            const error = err as { stdout?: string; stderr?: string; message?: string };
            const stderr = error.stderr || error.stdout || error.message || "Unknown error";
            results.push("## ❌ TypeScript Check: FAILED");
            results.push("```");
            results.push(stderr.substring(0, 2000));
            results.push("```");
        }
        results.push("");
    }

    // 2. Lint Check
    if (args.checkLint !== false) {
        try {
            // Locate the ESLint config nearest to the target (monorepo/consumer).
            const eslintConfig = findNearest(
                targetPath,
                ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.json"],
                projectRoot,
            );
            if (!eslintConfig) {
                results.push("## ✅ Lint Check: SKIPPED (no ESLint config)");
                results.push("No ESLint configuration found for this path.");
            } else {
                const configDir = path.dirname(eslintConfig);
                const lintTarget = path.relative(configDir, targetPath) || ".";
                const lintOutput = execFileSync("npx", ["eslint", lintTarget], {
                    cwd: configDir,
                    stdio: "pipe",
                    timeout: 30000,
                    encoding: "utf8"
                });
                const lintStr = lintOutput.trim();
                if (lintStr) {
                    results.push("## ⚠️ Lint Check: ISSUES FOUND");
                    results.push("```");
                    results.push(lintStr.substring(0, 2000));
                    results.push("```");
                } else {
                    results.push("## ✅ Lint Check: PASSED");
                    results.push("No lint issues found.");
                }
            }
        } catch (err: unknown) {
            const error = err as { stdout?: string; stderr?: string; message?: string };
            const stderr = error.stderr || error.stdout || error.message || "Unknown error";
            // ESLint returns non-zero exit code when issues are found
            if (stderr.includes("ESLint") || stderr.includes("eslint")) {
                results.push("## ❌ Lint Check: FAILED");
                results.push("```");
                results.push(stderr.substring(0, 2000));
                results.push("```");
            } else {
                results.push("## ✅ Lint Check: PASSED (no ESLint config)");
            }
        }
        results.push("");
    }

    // 3. Code Complexity Check (basic heuristic)
    if (args.checkComplexity !== false) {
        const qualityResult = analyzePathQuality(projectRoot, args.path);
        const complexityIssues = qualityResult.issues.filter(issue => issue.type === "complexity");

        if (complexityIssues.length > 0) {
            hasErrors = true;
            results.push(`## ⚠️ Code Complexity Issues (${complexityIssues.length})`);
            complexityIssues.forEach(issue => {
                results.push(`- ${issue.file}:${issue.line} — ${issue.message}`);
            });
        } else {
            results.push("## ✅ Code Complexity: OK");
            results.push("No complexity issues found.");
        }
        results.push("");
    }

    // Summary
    results.push("---");
    results.push(`**Overall Status:** ${hasErrors ? "⚠️ Issues Found" : "✅ All Checks Passed"}`);

    return {
        content: [{ type: "text", text: results.join("\n") }],
        isError: hasErrors
    };
}
