import { execSync } from "child_process";
import { RunTestsArgs, ToolResult } from "../types.js";
import { getBackendLanguage, getDefaultTestCommand } from "../../utils/cli.js";

const TEST_COMMAND_ALLOW_LIST = [
    "npm test",
    "npm run test",
    "npx vitest",
    "pytest",
    "go test",
    "dotnet test",
    "mvn test",
    "./gradlew test",
    "cargo test"
];

/**
 * Executes project tests and returns results for agent analysis.
 */
export function handleRunTests(projectRoot: string, args: RunTestsArgs): ToolResult {
    const language = getBackendLanguage(projectRoot);
    const testCommand = args.command || getDefaultTestCommand(language);
    
    // Validate command to prevent shell injection / chaining
    const isAllowed = TEST_COMMAND_ALLOW_LIST.some(allowedCmd => testCommand.startsWith(allowedCmd));
    if (!isAllowed) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Test command not allowed: "${testCommand}". Must start with one of: ${TEST_COMMAND_ALLOW_LIST.join(", ")}` }]
        };
    }

    if (/[;&|><$`\n\r]/.test(testCommand)) {
        return {
            isError: true,
            content: [{ type: "text", text: "[ERROR] Test command rejected: Shell metacharacters are forbidden to prevent command injection." }]
        };
    }

    try {
        const output = execSync(testCommand, { cwd: projectRoot, encoding: "utf8", stdio: "pipe" });
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
