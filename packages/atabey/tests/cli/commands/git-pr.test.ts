import cp from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gitPrCommand } from "../../../src/cli/commands/git.js";

/**
 * [B1] Tests for the agent-driven PR flow (`atabey git pr`).
 * Uses a real temporary git repository with a bare "origin" remote — no
 * network, no GitHub. `process.exit` is mocked so failures are observable.
 */
describe("git pr command (B1)", () => {
    let repoDir: string;
    let originDir: string;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    const git = (args: string[], cwd: string) =>
        cp.execSync(
            ["git", ...args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a))].join(" "),
            { encoding: "utf8", cwd },
        );

    beforeEach(() => {
        repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-gitpr-"));
        originDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-gitpr-origin-"));
        git(["init", "-b", "main"], repoDir);
        git(["config", "user.email", "test@atabey.local"], repoDir);
        git(["config", "user.name", "Atabey Test"], repoDir);
        fs.writeFileSync(path.join(repoDir, "README.md"), "# test\n");
        git(["add", "-A"], repoDir);
        git(["commit", "-m", "initial commit"], repoDir);
        // bare origin remote (offline push target)
        cp.execSync(`git init --bare -b main ${JSON.stringify(originDir)}`, { encoding: "utf8" });
        git(["remote", "add", "origin", originDir], repoDir);
        git(["push", "-u", "origin", "main"], repoDir);

        exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
        const prevCwd = process.cwd();
        process.chdir(repoDir);
        (process as { __gitPrPrevCwd?: string }).__gitPrPrevCwd = prevCwd;
    });

    afterEach(() => {
        const prevCwd = (process as { __gitPrPrevCwd?: string }).__gitPrPrevCwd;
        if (prevCwd) process.chdir(prevCwd);
        exitSpy.mockRestore();
        fs.rmSync(repoDir, { recursive: true, force: true });
        fs.rmSync(originDir, { recursive: true, force: true });
    });

    it("refuses to open a PR from a protected branch (main)", async () => {
        await gitPrCommand([]);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("refuses to open a PR from a protected branch (master)", async () => {
        git(["checkout", "-b", "master"], repoDir);
        await gitPrCommand([]);
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it("pushes a feature branch to origin and falls back to a manual PR suggestion", async () => {
        git(["checkout", "-b", "agent/backend-login"], repoDir);
        fs.writeFileSync(path.join(repoDir, "feature.ts"), "export const x = 1;\n");
        git(["add", "-A"], repoDir);
        git(["commit", "-m", "feat(backend): add login endpoint"], repoDir);

        const writes: string[] = [];
        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
            writes.push(String(chunk));
            return true;
        }) as typeof process.stdout.write);
        try {
            await gitPrCommand(["Add login endpoint"]);
        } finally {
            stdoutSpy.mockRestore();
        }

        // Pushed successfully — no hard exit
        expect(exitSpy).not.toHaveBeenCalledWith(1);
        const output = writes.join("");
        // Either a compare URL or a suggested PR title/body is printed
        expect(output).toMatch(/Pull request created|Open a PR manually|Pushed branch|SUGGESTED PR TITLE/);
        // The branch exists on the (bare) remote
        const remoteBranches = git(["ls-remote", "--heads", "origin"], repoDir);
        expect(remoteBranches).toContain("agent/backend-login");
    });

    it("auto-commits pending changes when --auto-commit is passed", async () => {
        git(["checkout", "-b", "agent/auto-commit-test"], repoDir);
        fs.writeFileSync(path.join(repoDir, "pending.txt"), "pending change\n");

        await gitPrCommand(["--auto-commit"]);

        expect(exitSpy).not.toHaveBeenCalledWith(1);
        const status = git(["status", "--porcelain"], repoDir);
        expect(status).toBe("");
    });
});
