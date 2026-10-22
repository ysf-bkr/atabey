import { execFile } from "child_process";
import { ToolArgs, ToolResult } from "../types.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { getBackendLanguage, getDefaultLintCommand, getExecutionCwd } from "atabey-mcp/utils/cli.js";

const TIMEOUT = 60000; // 60 seconds

/**
 * Handles running the project's linter.
 *
 * [SECURITY] Uses `execFile` (no shell) so the configured lint command is split
 * and executed directly — shell metacharacters and shell-only mutations
 * (`go fmt`, `cargo fmt`, `dotnet format`, ...) cannot be smuggled through.
 */
export function handleCheckLint(projectRoot: string, _args: ToolArgs): Promise<ToolResult> {
    const language = getBackendLanguage(projectRoot);
    const cwd = getExecutionCwd(projectRoot);
    const lintCommand = getDefaultLintCommand(language, cwd);

    // Split the command string into argv — no shell interpretation.
    const argv = lintCommand.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
    const cmd = argv.shift() || "";
    const cmdArgs = argv.map((a) => a.replace(/^["']|["']$/g, ""));

    return new Promise((resolve) => {
        if (!cmd) {
            resolve({
                isError: true,
                content: [{ type: "text", text: `[ERROR] Empty lint command for ${language}.` }]
            });
            return;
        }

        execFile(cmd, cmdArgs, { cwd, timeout: TIMEOUT, shell: false }, (error, stdout, stderr) => {
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
