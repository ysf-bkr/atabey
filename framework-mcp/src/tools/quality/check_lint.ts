import { exec } from "child_process";
import { ToolArgs, ToolResult } from "../types.js";
import { Metrics } from "../../utils/metrics.js";
import { getBackendLanguage, getDefaultLintCommand } from "../../utils/cli.js";

const TIMEOUT = 60000; // 60 seconds

/**
 * Handles running the project's linter.
 */
export function handleCheckLint(projectRoot: string, _args: ToolArgs): Promise<ToolResult> {
    const language = getBackendLanguage(projectRoot);
    const lintCommand = getDefaultLintCommand(language);

    return new Promise((resolve) => {
        exec(lintCommand, { cwd: projectRoot, timeout: TIMEOUT }, (error, stdout, stderr) => {
            const output = stdout + stderr;
            const tokens = Metrics.estimateTokens(output);
            
            if (error) {
                const err = `Linting failed for ${language} with command: ${lintCommand}. ${error.message}`;
                Metrics.logError(projectRoot, "@mcp", "check_lint", err);
                resolve({
                    isError: true,
                    content: [{ type: "text", text: `[ERROR] Lint Errors Found (${language}):\n\n${output}` }]
                });
                return;
            }

            Metrics.logUsage(projectRoot, "@mcp", "check_lint", tokens);
            resolve({
                content: [{ type: "text", text: `[OK] Lint check passed successfully for ${language}:\n\n${output}` }]
            });
        });
    });
}
