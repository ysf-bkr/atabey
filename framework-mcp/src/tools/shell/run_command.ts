import { spawn } from "child_process";
import { Metrics } from "../../utils/metrics.js";
import { RunCommandArgs, ToolResult } from "../types.js";

// Each entry defines the executable and its allowed args prefix
const COMMAND_ALLOW_LIST: Array<{ cmd: string; args?: string[] }> = [
    // Package managers
    { cmd: "npm", args: ["test"] },
    { cmd: "npm", args: ["run"] },
    { cmd: "npm", args: ["install"] },
    { cmd: "npm", args: ["ci"] },
    { cmd: "npm", args: ["audit"] },
    { cmd: "npx", args: ["vitest"] },
    { cmd: "npx", args: ["tsc"] },
    { cmd: "npx", args: ["eslint"] },
    { cmd: "yarn", args: ["test"] },
    { cmd: "yarn", args: ["run"] },
    { cmd: "yarn", args: ["install"] },
    { cmd: "pnpm", args: ["test"] },
    { cmd: "pnpm", args: ["run"] },
    { cmd: "pnpm", args: ["install"] },

    // Git
    { cmd: "git", args: ["status"] },
    { cmd: "git", args: ["diff"] },
    { cmd: "git", args: ["log"] },
    { cmd: "git", args: ["branch"] },
    { cmd: "git", args: ["stash"] },
    { cmd: "git", args: ["add"] },
    { cmd: "git", args: ["commit"] },
    { cmd: "git", args: ["push"] },
    { cmd: "git", args: ["pull"] },
    { cmd: "git", args: ["fetch"] },
    { cmd: "git", args: ["merge"] },
    { cmd: "git", args: ["rebase"] },
    { cmd: "git", args: ["checkout"] },
    { cmd: "git", args: ["reset"] },

    // Build tools
    { cmd: "make" },
    { cmd: "cmake" },
    { cmd: "dotnet", args: ["test"] },
    { cmd: "dotnet", args: ["format"] },
    { cmd: "dotnet", args: ["build"] },
    { cmd: "dotnet", args: ["run"] },
    { cmd: "dotnet", args: ["restore"] },
    { cmd: "go", args: ["test"] },
    { cmd: "go", args: ["fmt"] },
    { cmd: "go", args: ["build"] },
    { cmd: "go", args: ["run"] },
    { cmd: "go", args: ["vet"] },
    { cmd: "go", args: ["mod"] },
    { cmd: "pytest" },
    { cmd: "ruff", args: ["check"] },
    { cmd: "ruff", args: ["format"] },
    { cmd: "mvn" },
    { cmd: "./gradlew" },
    { cmd: "cargo", args: ["test"] },
    { cmd: "cargo", args: ["build"] },
    { cmd: "cargo", args: ["check"] },
    { cmd: "cargo", args: ["fmt"] },

    // File operations (safe) — spawn prevents shell injection
    { cmd: "mkdir" },
    { cmd: "cp" },
    { cmd: "mv" },
    { cmd: "rmdir" },
    { cmd: "cat" },
    { cmd: "ls" },
    { cmd: "touch" },
    { cmd: "head" },
    { cmd: "tail" },
    { cmd: "wc" },
    { cmd: "grep" },
    { cmd: "find" },
    { cmd: "sort" },
    { cmd: "uniq" },
    { cmd: "echo" },
    { cmd: "pwd" },
    { cmd: "which" },
    { cmd: "file" },
    { cmd: "du" },
    { cmd: "df" },
];

const TIMEOUT = 30000; // 30 seconds

/**
 * Parse a command string into executable + args array.
 * Uses spawn for safety (no shell injection).
 */
function parseCommand(cmdString: string): { cmd: string; args: string[] } | null {
    const parts = cmdString.trim().split(/\s+/);
    if (parts.length === 0) return null;
    return { cmd: parts[0], args: parts.slice(1) };
}

/**
 * Check if a parsed command matches the allow list.
 */
function isAllowed(parsed: { cmd: string; args: string[] }): boolean {
    return COMMAND_ALLOW_LIST.some(entry => {
        if (entry.cmd !== parsed.cmd) return false;
        if (!entry.args) return true; // Any args allowed for this cmd
        if (!parsed.args || parsed.args.length < entry.args.length) return false;
        // Check that args start with the allowed prefix
        return entry.args.every((arg, i) => parsed.args[i] === arg);
    });
}

export function handleRunCommand(projectRoot: string, args: RunCommandArgs): Promise<ToolResult> {
    const command = args.command;

    // Parse command into executable + args
    const parsed = parseCommand(command);
    if (!parsed) {
        return Promise.resolve({
            content: [{ type: "text", text: "ERROR: Empty command." }],
            isError: true,
        });
    }

    if (!isAllowed(parsed)) {
        const allowedList = COMMAND_ALLOW_LIST.map(e => e.args ? `${e.cmd} ${e.args.join(" ")}` : e.cmd);
        const errorMsg = `Command not allowed: "${command}". Only the following are allowed: ${allowedList.join(", ")}`;
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied)`, errorMsg);
        return Promise.resolve({
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        });
    }

    // Reject any args containing shell metacharacters
    const hasShellMetacharacters = parsed.args.some(a => /[;&|><$`\n\r]/.test(a));
    if (hasShellMetacharacters) {
        const errorMsg = "Command rejected: Shell metacharacters are forbidden to prevent command injection.";
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied: metacharacters)`, errorMsg);
        return Promise.resolve({
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        });
    }

    return new Promise((resolve) => {
        const child = spawn(parsed.cmd, parsed.args, {
            cwd: projectRoot,
            timeout: TIMEOUT,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
        child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

        child.on("error", (err) => {
            const errorMsg = `Failed to start command: ${err.message}`;
            Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command}`, errorMsg);
            resolve({
                content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
                isError: true,
            });
        });

        child.on("close", (code) => {
            const output = stdout + stderr;
            const tokens = Metrics.estimateTokens(output);
            Metrics.logUsage(projectRoot, "@mcp", `run_shell_command: ${command}`, tokens);

            if (code !== 0) {
                const errorMsg = `Command failed with exit code ${code}.`;
                Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command}`, errorMsg);
                resolve({
                    content: [{ type: "text", text: `ERROR: ${errorMsg}. Output: ${output}` }],
                    isError: true,
                });
                return;
            }

            // Truncate long outputs
            const MAX_OUTPUT_LENGTH = 5000;
            const truncatedOutput = output.length > MAX_OUTPUT_LENGTH
                ? output.substring(0, MAX_OUTPUT_LENGTH) + "... [TRUNCATED] ..."
                : output;

            resolve({
                content: [{ type: "text", text: truncatedOutput }],
            });
        });
    });
}
