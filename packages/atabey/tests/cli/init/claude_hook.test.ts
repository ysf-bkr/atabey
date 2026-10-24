import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "../../../src/cli/platforms/core.js";
import { runAdapterPostInit } from "../../../src/cli/platforms/index.js";

/**
 * Claude Code hook verification.
 *
 * Schema source: code.claude.com/docs/en/hooks
 *  - settings shape: event → matcher group → nested `hooks` array
 *  - handler needs `type: "command"`
 *  - stdin payload carries `tool_name` and `tool_input`
 *  - blocking = JSON `hookSpecificOutput.permissionDecision: "deny"` on exit 0
 *    (exit 1 is a NON-blocking error and would let the call through)
 *
 * The hook script is executed for real here, so a regex/JSON regression fails the
 * suite instead of silently disabling enforcement.
 */
describe("Claude Code hook", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-claude-hook-"));
        process.env.ANTIGRAVITY_GLOBAL_DIR = path.join(tempDir, ".antigravity-global");
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
        runAdapterPostInit(ADAPTERS.claude, tempDir);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        delete process.env.ANTIGRAVITY_GLOBAL_DIR;
        vi.restoreAllMocks();
    });

    const settings = () => JSON.parse(fs.readFileSync(path.join(tempDir, ".claude", "settings.json"), "utf8"));
    const hookPath = () => path.join(tempDir, ".claude", "hooks", "pre-tool-use.cjs");

    /** Runs the generated hook with a Claude-shaped payload and returns stdout. */
    function runHook(payload: unknown): { stdout: string; exitCode: number } {
        try {
            const stdout = execFileSync(process.execPath, [hookPath()], {
                input: JSON.stringify(payload),
                encoding: "utf8",
                stdio: ["pipe", "pipe", "pipe"],
            });
            return { stdout: stdout.trim(), exitCode: 0 };
        } catch (err) {
            const e = err as { status?: number; stdout?: string };
            return { stdout: (e.stdout ?? "").trim(), exitCode: e.status ?? 1 };
        }
    }

    describe("settings.json schema", () => {
        it("nests the handler under a matcher group's `hooks` array", () => {
            const preToolUse = settings().hooks.PreToolUse;
            expect(Array.isArray(preToolUse)).toBe(true);

            const group = preToolUse.find((g: { matcher?: string }) => String(g.matcher).includes("Edit"));
            expect(group, "no PreToolUse group covering Edit").toBeDefined();
            expect(group.matcher).toContain("Bash");
            expect(group.matcher).toContain("PowerShell");

            // The documented shape: group.hooks[0].type === "command".
            expect(Array.isArray(group.hooks)).toBe(true);
            expect(group.hooks[0].type).toBe("command");
            expect(group.hooks[0].command).toContain("pre-tool-use.cjs");
            // The old bug: `command` sat on the group itself, which Claude ignores.
            expect(group.command).toBeUndefined();
        });

        it("denies built-in file tools in permissions and allows Atabey's MCP tools", () => {
            const perms = settings().permissions;
            expect(perms.deny).toEqual(expect.arrayContaining(["Edit", "Write"]));
            expect(perms.allow).toEqual(expect.arrayContaining(["mcp__atabey__*"]));
        });

        it("preserves existing user hooks, permissions and unrelated settings", () => {
            fs.rmSync(path.join(tempDir, ".claude"), { recursive: true, force: true });
            fs.mkdirSync(path.join(tempDir, ".claude"), { recursive: true });
            fs.writeFileSync(
                path.join(tempDir, ".claude", "settings.json"),
                JSON.stringify({
                    model: "claude-opus-5",
                    permissions: { allow: ["Bash(npm test)"], deny: ["Read(.env)"] },
                    hooks: {
                        PreToolUse: [
                            { matcher: "Bash", hooks: [{ type: "command", command: "./my-own-hook.sh" }] },
                        ],
                        Stop: [{ hooks: [{ type: "command", command: "./on-stop.sh" }] }],
                    },
                }),
            );

            runAdapterPostInit(ADAPTERS.claude, tempDir);
            const cfg = settings();

            expect(cfg.model).toBe("claude-opus-5");
            expect(cfg.permissions.allow).toEqual(expect.arrayContaining(["Bash(npm test)", "mcp__atabey__*"]));
            expect(cfg.permissions.deny).toEqual(expect.arrayContaining(["Read(.env)", "Edit"]));
            expect(cfg.hooks.Stop[0].hooks[0].command).toBe("./on-stop.sh");

            const commands = cfg.hooks.PreToolUse.flatMap((g: { hooks?: Array<{ command?: string }> }) =>
                (g.hooks ?? []).map((h) => h.command),
            );
            expect(commands).toContain("./my-own-hook.sh");
            expect(commands.some((c: string) => c?.includes("pre-tool-use.cjs"))).toBe(true);
        });

        it("does not add a duplicate Atabey hook group on re-init", () => {
            runAdapterPostInit(ADAPTERS.claude, tempDir);
            runAdapterPostInit(ADAPTERS.claude, tempDir);
            const cfg = settings();
            const atabeyGroups = cfg.hooks.PreToolUse.filter((g: { hooks?: Array<{ command?: string }> }) =>
                (g.hooks ?? []).some((h) => h.command?.includes("pre-tool-use.cjs")),
            );
            expect(atabeyGroups).toHaveLength(1);
        });
    });

    describe("hook behaviour", () => {
        it("denies built-in Edit with the documented permissionDecision JSON", () => {
            const res = runHook({ tool_name: "Edit", tool_input: { file_path: "a.ts", old_string: "x", new_string: "y" } });
            expect(res.exitCode).toBe(0);

            const out = JSON.parse(res.stdout);
            expect(out.hookSpecificOutput.hookEventName).toBe("PreToolUse");
            expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(out.hookSpecificOutput.permissionDecisionReason).toContain("Atabey MCP file tools");
        });

        it("denies built-in Write and NotebookEdit", () => {
            for (const tool of ["Write", "NotebookEdit", "MultiEdit"]) {
                const out = JSON.parse(runHook({ tool_name: tool, tool_input: {} }).stdout);
                expect(out.hookSpecificOutput.permissionDecision, tool).toBe("deny");
            }
        });

        it("allows Atabey's own MCP tools", () => {
            for (const tool of ["mcp__atabey__write_file", "mcp__atabey__replace_text", "mcp__atabey__run_shell_command"]) {
                const res = runHook({ tool_name: tool, tool_input: { path: "a.ts" } });
                expect(res.exitCode).toBe(0);
                expect(res.stdout).toBe("");
            }
        });

        it("does not block other MCP servers", () => {
            const res = runHook({ tool_name: "mcp__context7__query", tool_input: {} });
            expect(res.stdout).toBe("");
        });

        it("blocks shell file writes (Bash rm, redirect, sed -i)", () => {
            for (const command of ["rm -rf build", "echo x > file.ts", "sed -i 's/a/b/' a.ts", "git reset --hard"]) {
                const out = JSON.parse(runHook({ tool_name: "Bash", tool_input: { command } }).stdout);
                expect(out.hookSpecificOutput.permissionDecision, command).toBe("deny");
            }
        });

        it("blocks Windows PowerShell writes", () => {
            for (const command of ["Remove-Item -Recurse build", "Set-Content a.ts 'x'"]) {
                const out = JSON.parse(runHook({ tool_name: "PowerShell", tool_input: { command } }).stdout);
                expect(out.hookSpecificOutput.permissionDecision, command).toBe("deny");
            }
        });

        it("allows read-only shell commands", () => {
            for (const command of ["npm test", "git status", "ls -la", "npx tsc --noEmit"]) {
                expect(runHook({ tool_name: "Bash", tool_input: { command } }).stdout, command).toBe("");
            }
        });

        it("stays out of the way for unrelated tools and malformed input", () => {
            expect(runHook({ tool_name: "Read", tool_input: { file_path: "a.ts" } }).stdout).toBe("");
            expect(runHook({ tool_name: "Grep", tool_input: {} }).stdout).toBe("");
            expect(runHook({}).stdout).toBe("");
        });

        it("is executable", () => {
            if (process.platform !== "win32") {
                const mode = fs.statSync(hookPath()).mode;
                expect(mode & 0o100).toBeTruthy();
            }
        });
    });
});
