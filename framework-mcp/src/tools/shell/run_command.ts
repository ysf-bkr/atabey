import { exec } from "child_process";
import { Metrics } from "../../utils/metrics.js";
import { RunCommandArgs, ToolResult } from "../types.js";

const COMMAND_ALLOW_LIST = [
    // Package managers
    "npm test",
    "npm run",
    "npm install",
    "npm ci",
    "npm audit",
    "npx vitest",
    "npx tsc",
    "npx eslint",
    "yarn test",
    "yarn run",
    "yarn install",
    "pnpm test",
    "pnpm run",
    "pnpm install",

    // Git
    "git status",
    "git diff",
    "git log",
    "git branch",
    "git stash",
    "git add",
    "git commit",
    "git push",
    "git pull",
    "git fetch",
    "git merge",
    "git rebase",
    "git checkout",
    "git reset",

    // Build tools
    "npm run build",
    "npx tsc",
    "npx vite build",
    "npx webpack",
    "npx rollup",
    "npx esbuild",
    "make",
    "cmake",
    "dotnet test",
    "dotnet format",
    "dotnet build",
    "dotnet run",
    "dotnet restore",
    "go test",
    "go fmt",
    "go build",
    "go run",
    "go vet",
    "go mod",
    "pytest",
    "ruff check",
    "ruff format",
    "mvn",
    "./gradlew",
    "cargo test",
    "cargo build",
    "cargo check",
    "cargo fmt",

    // File operations (safe) — NOTE: "rm -rf" and "rm -r" intentionally excluded.
    // Only "rmdir" is allowed to prevent dangerous commands like "rm -rf /".
    "mkdir",
    "cp",
    "mv",
    "rmdir",
    "cat",
    "ls",
    "touch",
    "head",
    "tail",
    "wc",
    "grep",
    "find",
    "sort",
    "uniq",
    "echo",
    "pwd",
    "which",
    "file",
    "du",
    "df",
];

const TIMEOUT = 30000; // 30 seconds

export function handleRunCommand(projectRoot: string, args: RunCommandArgs): Promise<ToolResult> {
    const command = args.command;

    const isAllowed = COMMAND_ALLOW_LIST.some(allowedCmd => command.startsWith(allowedCmd));

    if (!isAllowed) {
        const errorMsg = `Command not allowed: "${command}". Only commands starting with the following are allowed: ${COMMAND_ALLOW_LIST.join(", ")}`;
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied)`, errorMsg);
        return Promise.resolve({
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        });
    }

    // Harden to prevent shell command injection / chaining
    const hasShellMetacharacters = /[;&|><$`\n\r]/.test(command);
    if (hasShellMetacharacters) {
        const errorMsg = "Command rejected: Shell metacharacters are forbidden to prevent command injection.";
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied: metacharacters)`, errorMsg);
        return Promise.resolve({
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        });
    }

    return new Promise((resolve) => {
        exec(command, { cwd: projectRoot, timeout: TIMEOUT }, (error, stdout, stderr) => {
            const output = stdout + stderr;
            const tokens = Metrics.estimateTokens(output);
            Metrics.logUsage(projectRoot, "@mcp", `run_shell_command: ${command}`, tokens);

            if (error) {
                const errorMsg = `Command failed with exit code ${error.code}: ${error.message}.`;
                Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command}`, errorMsg);
                resolve({
                    content: [{ type: "text", text: `ERROR: ${errorMsg}. Output: ${output}` }],
                    isError: true,
                });
                return;
            }

            // Truncate long outputs
            const MAX_OUTPUT_LENGTH = 5000;
            let truncatedOutput = output;
            if (output.length > MAX_OUTPUT_LENGTH) {
                truncatedOutput = output.substring(0, MAX_OUTPUT_LENGTH) + "... [TRUNCATED] ..."; // Simplified
            }

            resolve({ content: [{ type: "text", text: truncatedOutput }] });
        });
    });
}
