import { execFileSync } from "child_process";
import { scrubEnvForSubprocess } from "atabey-shared/secrets.js";
import { RunTestsArgs, ToolResult } from "../types.js";
import { getBackendLanguage, getDefaultTestCommand } from "atabey-mcp/utils/cli.js";

// Each entry is the allowed argv prefix. Matching is token-based so that
// "npm run evil-script" cannot masquerade as "npm run test".
const TEST_COMMAND_ALLOW_LIST: string[][] = [
    ["npm", "test"],
    ["npm", "run", "test"],
    ["npx", "vitest"],
    ["pytest"],
    ["go", "test"],
    ["dotnet", "test"],
    ["mvn", "test"],
    ["./gradlew", "test"],
    ["cargo", "test"],
];

function tokenize(command: string): string[] {
    return command.trim().split(/\s+/).filter(Boolean);
}

/**
 * Executes project tests and returns results for agent analysis.
 * Runs via execFileSync (no shell) with a token-based allow-list.
 */
export function handleRunTests(projectRoot: string, args: RunTestsArgs): ToolResult {
    const language = getBackendLanguage(projectRoot);
    const testCommand = args.command || getDefaultTestCommand(language);

    if (/[;&|><$`\n\r{}()]/.test(testCommand)) {
        return {
            isError: true,
            content: [{ type: "text", text: "[ERROR] Test command rejected: Shell metacharacters are forbidden to prevent command injection." }]
        };
    }

    const tokens = tokenize(testCommand);
    const isAllowed = TEST_COMMAND_ALLOW_LIST.some(
        (prefix) =>
            tokens.length >= prefix.length &&
            prefix.every((tok, i) => tokens[i] === tok),
    );
    if (!isAllowed || tokens.length === 0) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Test command not allowed: "${testCommand}". Must start with one of: ${TEST_COMMAND_ALLOW_LIST.map(p => p.join(" ")).join(", ")}` }]
        };
    }

    try {
        const output = execFileSync(tokens[0], tokens.slice(1), {
            cwd: projectRoot,
            encoding: "utf8",
            stdio: "pipe",
            env: {
                ...scrubEnvForSubprocess(process.env),
                // Circuit breaker: never hang on an interactive prompt.
                CI: "true",
                DEBIAN_FRONTEND: "noninteractive",
                GIT_TERMINAL_PROMPT: "0",
                npm_config_yes: "true",
                PIP_NO_INPUT: "1",
            },
        });
        return {
            content: [{ type: "text", text: `[OK] Tests passed successfully for ${language}!\n\n${output}` }]
        };
    } catch (error: unknown) {
        const err = error as { stderr?: Buffer; stdout?: Buffer };
        const stderr = err.stderr?.toString() || "";
        const stdout = err.stdout?.toString() || "";

        return {
            isError: true,
            content: [{
                type: "text",
                text: `[ERROR] Tests FAILED for ${language}!\n\n--- STDOUT ---\n${stdout}\n\n--- STDERR ---\n${stderr}`
            }]
        };
    }
}
