import { Metrics } from "atabey-mcp/utils/metrics.js";
import { RunCommandArgs, ToolResult } from "../types.js";
import { resolveActiveAgent, getAgentTier, verifyWritePermission } from "atabey-mcp/utils/permissions.js";
import { resolveFrameworkDir, safePath } from "atabey-mcp/utils/security.js";
import {
    runInSandbox,
    SandboxRequiredError,
    resolveSandboxRuntimeConfig,
} from "atabey-shared/sandbox-runtime.js";
import path from "path";

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

const TIMEOUT = parseInt(process.env.MCP_COMMAND_TIMEOUT_MS || "30000", 10);

// Shell metacharacters that are never needed for the allow-listed read/build
// commands and that enable injection. Note: (), {}, +, * are intentionally
// allowed (git messages, find -name globs); those risks are handled by the
// FORBIDDEN_FIND_FLAGS check and project-root path confinement below.
const SHELL_METACHARACTERS = /[;&|><$`\n\r]/;

// `find` predicates that perform deletion or arbitrary execution.
const FORBIDDEN_FIND_FLAGS = new Set([
    "-delete", "-exec", "-execdir", "-ok", "-okdir",
    "-fprint", "-fprint0", "-fprintf", "-fls",
]);

// Safe npm/yarn/pnpm run script names permitted without full container isolation.
const SAFE_RUN_SCRIPTS = new Set([
    "build", "test", "lint", "typecheck", "check", "format",
    "verify", "compile", "clean", "coverage",
]);

// Flags that re-enable lifecycle scripts or hijack binary execution during install.
const FORBIDDEN_INSTALL_FLAGS = new Set([
    "--foreground-scripts",
    "--ignore-scripts=false",
    "--scripts-prepend-node-path",
    "--scripts-prepend-node-path=true",
    "--scripts-prepend-node-path=auto",
]);

// Native build/run commands that execute arbitrary Makefile/build.gradle/code on host.
const SANDBOX_GATED_COMMANDS = new Set(["make", "cmake", "./gradlew", "mvn"]);

// Commands whose non-flag arguments are exclusively filesystem paths.
const PATH_ONLY_COMMANDS = new Set(["cat", "cp", "mv", "mkdir", "rmdir", "touch", "head", "tail"]);
// Commands that mix patterns and paths — only path-like args are validated.
const MIXED_COMMANDS = new Set(["grep", "wc", "sort", "uniq", "file", "du", "df", "find"]);

/**
 * Confines path-like arguments to the project root, blocks dangerous `find`
 * predicates, enforces `--ignore-scripts` on package installs, and gates
 * arbitrary script/build execution when running without sandbox isolation.
 * Returns an error string, or null when the args are safe.
 */
function validateCommandArgs(
    parsed: { cmd: string; args: string[] },
    projectRoot: string,
    effectiveSandboxMode: "none" | "uid" | "seatbelt" = "none",
): string | null {
    const { cmd, args } = parsed;
    const allowUnsandboxedScripts = process.env.ATABEY_ALLOW_UNSANDBOXED_SCRIPTS === "true";

    if (cmd === "find") {
        for (const a of args) {
            if (FORBIDDEN_FIND_FLAGS.has(a)) {
                return `Command rejected: 'find ${a}' is not permitted (bulk delete / arbitrary exec risk).`;
            }
        }
    }

    // Harden npm / yarn / pnpm install & run
    if (cmd === "npm" || cmd === "yarn" || cmd === "pnpm") {
        const sub = args[0] || "";
        if (sub === "install" || sub === "ci") {
            for (const a of args.slice(1)) {
                if (FORBIDDEN_INSTALL_FLAGS.has(a) || a.startsWith("--nodedir") || a.startsWith("--userconfig") || a.startsWith("--globalconfig") || a === "-g" || a === "--global") {
                    return `Command rejected: '${cmd} ${sub} ${a}' is not permitted (lifecycle script / config hijack risk).`;
                }
            }
            // Enforce --ignore-scripts to block preinstall/postinstall RCE
            if (process.env.ATABEY_ALLOW_INSTALL_SCRIPTS !== "true" && !args.includes("--ignore-scripts")) {
                args.push("--ignore-scripts");
            }
        } else if (sub === "run") {
            const scriptName = args[1] || "";
            if (!scriptName || scriptName.startsWith("-")) {
                return `Command rejected: '${cmd} run' requires an explicit script name.`;
            }
            if (effectiveSandboxMode === "none" && !allowUnsandboxedScripts && !SAFE_RUN_SCRIPTS.has(scriptName)) {
                return (
                    `Command rejected: '${cmd} run ${scriptName}' is not in the safe script allow-list ` +
                    `(${Array.from(SAFE_RUN_SCRIPTS).join(", ")}) when running without sandbox isolation. ` +
                    `Enable seatbelt/uid sandbox or set ATABEY_ALLOW_UNSANDBOXED_SCRIPTS=true.`
                );
            }
        }
    }

    // Gate arbitrary native build/run commands when unsandboxed
    if (
        effectiveSandboxMode === "none" &&
        !allowUnsandboxedScripts &&
        (SANDBOX_GATED_COMMANDS.has(cmd) ||
            (cmd === "dotnet" && args[0] === "run") ||
            (cmd === "go" && args[0] === "run"))
    ) {
        return (
            `Command rejected: '${cmd}${args[0] ? " " + args[0] : ""}' executes arbitrary code and requires ` +
            `sandbox isolation (seatbelt/uid) or ATABEY_ALLOW_UNSANDBOXED_SCRIPTS=true.`
        );
    }

    const validatePath = (p: string): string | null => {
        if (!p || p.startsWith("-")) return null;
        if (p.includes("\0")) return "Command rejected: illegal null byte in path.";
        if (p === "~" || p.startsWith("~/")) {
            return `Command rejected: home-directory path "${p}" is not allowed.`;
        }
        try {
            safePath(projectRoot, p);
        } catch {
            return `Command rejected: path "${p}" escapes the project root.`;
        }
        return null;
    };

    if (PATH_ONLY_COMMANDS.has(cmd)) {
        for (const a of args) {
            const err = validatePath(a);
            if (err) return err;
        }
    } else if (MIXED_COMMANDS.has(cmd)) {
        for (const a of args) {
            if (a.startsWith("-")) continue;
            if (a.includes("/") || a.includes("\\") || a.startsWith(".") || a.startsWith("~")) {
                const err = validatePath(a);
                if (err) return err;
            }
        }
    }

    return null;
}

/**
 * Checks if a parsed command represents a state-mutating (write) operation.
 */
function isWriteCommand(parsed: { cmd: string; args: string[] }): boolean {
    const cmd = parsed.cmd;
    const firstArg = parsed.args[0] || "";

    const writeCmds = ["mkdir", "cp", "mv", "rmdir", "touch", "make", "cmake", "./gradlew", "mvn"];
    if (writeCmds.includes(cmd)) return true;

    if (cmd === "npm" && ["install", "ci", "audit", "run"].includes(firstArg)) return true;
    if (cmd === "yarn" && ["install", "run"].includes(firstArg)) return true;
    if (cmd === "pnpm" && ["install", "run"].includes(firstArg)) return true;

    if (cmd === "git" && ["add", "commit", "push", "pull", "merge", "rebase", "checkout", "reset", "stash", "clean"].includes(firstArg)) return true;

    if (cmd === "dotnet" && ["build", "run", "restore", "format"].includes(firstArg)) return true;
    if (cmd === "go" && ["build", "run", "mod", "fmt", "generate", "fix"].includes(firstArg)) return true;
    if (cmd === "cargo" && ["build", "check", "fmt", "fix", "generate"].includes(firstArg)) return true;

    // Formatters mutate source files on disk — they are writes, not reads.
    if (["rustfmt", "gofmt", "black", "ruff", "prettier", "eslint", "stylelint"].includes(cmd)) {
        const mutating = ["", "--fix", "--write", "format", "fmt"];
        if (mutating.includes(firstArg) || parsed.args.includes("--fix") || parsed.args.includes("--write")) return true;
    }
    if (cmd === "ruff" && firstArg === "format") return true;
    if (cmd === "prettier" && (firstArg === "--write" || firstArg === "-w" || parsed.args.includes("--write"))) return true;

    return false;
}

/**
 * Tokenizes a command line string into tokens handling single and double quotes.
 * Allows commands like `git commit -m "fix(auth): correct token expiry"` to preserve
 * arguments with spaces without splitting them into words.
 */
export function tokenizeCommandLine(cmdString: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let inQuote: '"' | "'" | null = null;
    let escaped = false;

    for (let i = 0; i < cmdString.length; i++) {
        const char = cmdString[i];

        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            escaped = true;
            continue;
        }

        if (inQuote) {
            if (char === inQuote) {
                inQuote = null;
            } else {
                current += char;
            }
        } else if (char === '"' || char === "'") {
            inQuote = char;
        } else if (/\s/.test(char)) {
            if (current.length > 0) {
                tokens.push(current);
                current = "";
            }
        } else {
            current += char;
        }
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    return tokens;
}

/**
 * Parse a command string into executable + args array.
 * Uses spawn for safety (no shell injection).
 */
function parseCommand(cmdString: string): { cmd: string; args: string[] } | null {
    const parts = tokenizeCommandLine(cmdString.trim());
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

export async function handleRunCommand(projectRoot: string, args: RunCommandArgs): Promise<ToolResult> {
    const command = args.command;

    // Parse command into executable + args
    const parsed = parseCommand(command);
    if (!parsed) {
        return {
            content: [{ type: "text", text: "ERROR: Empty command." }],
            isError: true,
        };
    }

    // Resolve active agent and tier to check command permission
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir)
        ? frameworkDir
        : path.resolve(projectRoot, frameworkDir);
    const activeAgent = resolveActiveAgent(absoluteFrameworkPath);

    if (activeAgent) {
        const tier = getAgentTier(activeAgent);
        if (tier === "recon" && isWriteCommand(parsed)) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `[RBAC] Permission Denied: Agent ${activeAgent} (tier: recon) is not allowed to run write/build command "${command}". Recon agents are restricted to read-only commands.`,
                }],
            };
        }

        // Verify write permissions for path-mutating commands against permission-matrix.json
        if (PATH_ONLY_COMMANDS.has(parsed.cmd) && isWriteCommand(parsed)) {
            for (const arg of parsed.args) {
                if (arg && !arg.startsWith("-")) {
                    try {
                        verifyWritePermission(projectRoot, arg, activeAgent);
                    } catch (permErr) {
                        return {
                            isError: true,
                            content: [{
                                type: "text",
                                text: `[RBAC] ${(permErr as Error).message}`,
                            }],
                        };
                    }
                }
            }
        }
    }

    if (!isAllowed(parsed)) {
        const allowedList = COMMAND_ALLOW_LIST.map(e => e.args ? `${e.cmd} ${e.args.join(" ")}` : e.cmd);
        const errorMsg = `Command not allowed: "${command}". Only the following are allowed: ${allowedList.join(", ")}`;
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied)`, errorMsg);
        return {
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        };
    }

    // Reject any args containing shell metacharacters
    const hasShellMetacharacters = parsed.args.some(a => SHELL_METACHARACTERS.test(a));
    if (hasShellMetacharacters) {
        const errorMsg = "Command rejected: Shell metacharacters are forbidden to prevent command injection.";
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied: metacharacters)`, errorMsg);
        return {
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        };
    }

    // Confine path arguments to the project root, enforce --ignore-scripts, and block dangerous predicates.
    const runtimeCfg = resolveSandboxRuntimeConfig(projectRoot, TIMEOUT);
    const pathError = validateCommandArgs(parsed, projectRoot, runtimeCfg.effectiveMode);
    if (pathError) {
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command} (denied: policy)`, pathError);
        return {
            content: [{ type: "text", text: `ERROR: ${pathError}` }],
            isError: true,
        };
    }

    // Phase 1.1: execute via sandbox runtime (none | uid | container)
    try {
        const result = await runInSandbox({
            command: parsed.cmd,
            args: parsed.args,
            projectRoot,
            timeoutMs: TIMEOUT,
        });

        const output = result.stdout + result.stderr;
        const tokens = Metrics.estimateTokens(output);
        Metrics.logUsage(projectRoot, "@mcp", `run_shell_command: ${command}`, tokens);

        if (result.code !== 0) {
            const errorMsg = `Command failed with exit code ${result.code}.`;
            Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command}`, errorMsg);
            return {
                content: [{
                    type: "text",
                    text: `ERROR: ${errorMsg}. Output: ${output}\n[sandbox: ${result.isolationLabel}]`,
                }],
                isError: true,
            };
        }

        const MAX_OUTPUT_LENGTH = 5000;
        const truncatedOutput = output.length > MAX_OUTPUT_LENGTH
            ? output.substring(0, MAX_OUTPUT_LENGTH) + "... [TRUNCATED] ..."
            : output;

        // Surface isolation mode for auditability (short footer when non-empty output)
        const footer = result.runtime !== "none" ? `\n[sandbox: ${result.isolationLabel}]` : "";
        return {
            content: [{ type: "text", text: truncatedOutput + footer }],
        };
    } catch (err) {
        if (err instanceof SandboxRequiredError) {
            Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command}`, err.message);
            return {
                isError: true,
                content: [{ type: "text", text: `ERROR: ${err.message}` }],
            };
        }
        const cfg = resolveSandboxRuntimeConfig(projectRoot, TIMEOUT);
        const errorMsg = `Failed to start command: ${(err as Error).message} (sandbox mode=${cfg.effectiveMode})`;
        Metrics.logError(projectRoot, "@mcp", `run_shell_command: ${command}`, errorMsg);
        return {
            content: [{ type: "text", text: `ERROR: ${errorMsg}` }],
            isError: true,
        };
    }
}
