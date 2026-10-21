import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HeadlessCliAdapter } from "../../../src/modules/runtime/adapters/headless-cli.js";
import { AgentRuntime } from "../../../src/modules/runtime/agent-runtime.js";
import { ensureAgentWorktree } from "../../../src/modules/runtime/worktree.js";
import type { AgentAdapter } from "../../../src/modules/runtime/adapters/types.js";

/** A preset that runs `node -e "<code>"` so tests need no external CLI. */
const nodePreset = (code: string) => ({
    command: process.execPath,
    buildArgs: () => ["-e", code],
});

let TMP: string;

beforeEach(() => {
    TMP = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-runtime-"));
});

afterEach(() => {
    fs.rmSync(TMP, { recursive: true, force: true });
});

function initGitRepo(dir: string): void {
    const git = (args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
    git(["init"]);
    git(["config", "user.email", "t@t.t"]);
    git(["config", "user.name", "t"]);
    fs.writeFileSync(path.join(dir, "README.md"), "x");
    git(["add", "."]);
    git(["commit", "-m", "init"]);
}

describe("HeadlessCliAdapter", () => {
    it("isAvailable resolves an absolute executable path", async () => {
        const adapter = new HeadlessCliAdapter("node-test", nodePreset("process.exit(0)"));
        expect(await adapter.isAvailable()).toBe(true);
    });

    it("isAvailable is false for a missing CLI", async () => {
        const adapter = new HeadlessCliAdapter("missing", {
            command: "definitely-not-a-real-cli-xyz",
            buildArgs: () => [],
        });
        expect(await adapter.isAvailable()).toBe(false);
    });

    it("runs a turn and captures stdout", async () => {
        const adapter = new HeadlessCliAdapter("node-echo", nodePreset("process.stdout.write('hello from cli')"));
        const res = await adapter.runTurn({ agentName: "@test", prompt: "x", cwd: TMP, timeoutMs: 10000 });
        expect(res.ok).toBe(true);
        expect(res.output).toContain("hello from cli");
        expect(res.exitCode).toBe(0);
    });

    it("reports a non-zero exit as failure", async () => {
        const adapter = new HeadlessCliAdapter(
            "node-fail",
            nodePreset("process.stderr.write('boom'); process.exit(2)"),
        );
        const res = await adapter.runTurn({ agentName: "@test", prompt: "x", cwd: TMP, timeoutMs: 10000 });
        expect(res.ok).toBe(false);
        expect(res.exitCode).toBe(2);
        expect(res.error).toContain("boom");
    });

    it("kills a hanging process on timeout", async () => {
        const adapter = new HeadlessCliAdapter("node-hang", nodePreset("setTimeout(() => {}, 60000)"));
        const res = await adapter.runTurn({ agentName: "@test", prompt: "x", cwd: TMP, timeoutMs: 300 });
        expect(res.timedOut).toBe(true);
        expect(res.ok).toBe(false);
    });

    it("caps oversized output", async () => {
        const adapter = new HeadlessCliAdapter("node-big", nodePreset("process.stdout.write('x'.repeat(5000))"));
        const res = await adapter.runTurn({
            agentName: "@test",
            prompt: "x",
            cwd: TMP,
            maxOutputChars: 100,
            timeoutMs: 10000,
        });
        expect(res.output.length).toBeLessThan(300);
        expect(res.output).toContain("truncated");
    });

    it("spawns with PWD synced to cwd (some CLIs read PWD, not the real cwd)", async () => {
        const adapter = new HeadlessCliAdapter("node-pwd", {
            command: process.execPath,
            buildArgs: () => ["-e", "process.stdout.write(process.env.PWD || '')"],
        });
        const res = await adapter.runTurn({ agentName: "@test", prompt: "x", cwd: TMP, timeoutMs: 10000 });
        expect(res.output.trim()).toBe(TMP);
    });
});

describe("AgentRuntime", () => {
    it("reports an unknown CLI gracefully (never throws)", async () => {
        const report = await AgentRuntime.runTurn("@backend", "do something", { cliId: "claude-not-real", cwd: TMP });
        expect(report.ok).toBe(false);
        expect(report.error).toBeTruthy();
    });

    it("runs a turn through an injected adapter with token accounting", async () => {
        const fake: AgentAdapter = {
            id: "fake",
            isAvailable: async () => true,
            runTurn: async () => ({
                ok: true,
                output: "done: built the API",
                exitCode: 0,
                durationMs: 5,
                timedOut: false,
                adapterId: "fake",
            }),
        };
        const report = await AgentRuntime.runTurn("@backend", "build the API", {
            adapter: fake,
            tokenBudget: 1,
            cwd: TMP,
        });
        expect(report.ok).toBe(true);
        expect(report.output).toContain("done");
        expect(report.agent).toBe("@backend");
        expect(report.inputTokens).toBeGreaterThan(0);
        expect(report.outputTokens).toBeGreaterThan(0);
        expect(report.isolation).toBe("main-tree");
    });

    it("fails gracefully when the injected adapter is unavailable", async () => {
        const fake: AgentAdapter = {
            id: "envtest",
            isAvailable: async () => false,
            runTurn: async () => ({
                ok: false,
                output: "",
                exitCode: null,
                durationMs: 0,
                timedOut: false,
                adapterId: "envtest",
            }),
        };
        const report = await AgentRuntime.runTurn("@quality", "x", { adapter: fake, cwd: TMP });
        expect(report.ok).toBe(false);
        expect(report.error).toContain("not found");
    });
});

describe("AgentRuntime — worktree isolation (P0.4)", () => {
    it("runs the turn inside a per-agent git worktree", async () => {
        const repo = path.join(TMP, "repo");
        fs.mkdirSync(repo);
        initGitRepo(repo);

        let seenCwd = "";
        const fake: AgentAdapter = {
            id: "capture",
            isAvailable: async () => true,
            runTurn: async (req) => {
                seenCwd = req.cwd;
                return { ok: true, output: "ok work", exitCode: 0, durationMs: 1, timedOut: false, adapterId: "capture" };
            },
        };

        const report = await AgentRuntime.runTurn("@backend", "write code", {
            adapter: fake,
            worktree: true,
            cwd: repo,
        });

        expect(report.ok).toBe(true);
        expect(report.isolation).toBe("worktree");
        expect(seenCwd).toContain(path.join(".atabey", "worktrees"));
        expect(seenCwd).not.toBe(repo);
    });

    it("ensureAgentWorktree returns the main tree when not a git repo", () => {
        const notRepo = path.join(TMP, "plain");
        fs.mkdirSync(notRepo);
        expect(ensureAgentWorktree(notRepo, "@x", false)).toBe(notRepo);
        expect(() => ensureAgentWorktree(notRepo, "@x", true)).toThrow(/not a git repository/i);
    });
});

describe("AgentRuntime — sandbox fail-closed (P0.4)", () => {
    it("blocks the turn when sandbox is required but unavailable", async () => {
        const prev = process.env.ATABEY_SANDBOX_REQUIRED;
        const prevRuntime = process.env.ATABEY_SANDBOX_RUNTIME;
        process.env.ATABEY_SANDBOX_REQUIRED = "true";
        process.env.ATABEY_SANDBOX_RUNTIME = "none";
        try {
            const fake: AgentAdapter = {
                id: "sbx",
                isAvailable: async () => true,
                runTurn: async () => ({
                    ok: true,
                    output: "should not run",
                    exitCode: 0,
                    durationMs: 1,
                    timedOut: false,
                    adapterId: "sbx",
                }),
                buildCommand: () => ({ command: process.execPath, args: ["-e", "process.stdout.write('x')"] }),
            };
            const report = await AgentRuntime.runTurn("@backend", "x", { adapter: fake, sandbox: true, cwd: TMP });
            expect(report.ok).toBe(false);
            expect(report.sandbox).toBe("failed");
            expect(report.error).toContain("SANDBOX");
        } finally {
            if (prev === undefined) delete process.env.ATABEY_SANDBOX_REQUIRED;
            else process.env.ATABEY_SANDBOX_REQUIRED = prev;
            if (prevRuntime === undefined) delete process.env.ATABEY_SANDBOX_RUNTIME;
            else process.env.ATABEY_SANDBOX_RUNTIME = prevRuntime;
        }
    });
});
