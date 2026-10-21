import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Smoke tests for CLI commands that previously had no test coverage
 * (api, db, secrets, git, worktree, script, security).
 *
 * Layer 1 follows the established export-contract pattern of the other
 * command tests. Layer 2 adds functional smoke coverage for the secret
 * vault and database status against a temporary framework dir.
 */
describe("Uncovered CLI Commands — smoke tests", () => {
    let tempDir: string;
    let frameworkDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-cli-smoke-"));
        frameworkDir = path.join(tempDir, ".atabey");
        fs.mkdirSync(frameworkDir, { recursive: true });
        process.env.ATABEY_TEST_DIR = frameworkDir;
        const prevCwd = process.cwd();
        process.chdir(tempDir);
        (process as { __prevCwd?: string }).__prevCwd = prevCwd;
    });

    afterEach(() => {
        const prevCwd = (process as { __prevCwd?: string }).__prevCwd;
        if (prevCwd) process.chdir(prevCwd);
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe("export contracts", () => {
        it("api command exports apiCommand", async () => {
            const mod = await import("../../../src/cli/commands/api.js");
            expect(typeof mod.apiCommand).toBe("function");
        });

        it("db command exports dbCommand", async () => {
            const mod = await import("../../../src/cli/commands/db.js");
            expect(typeof mod.dbCommand).toBe("function");
        });

        it("secrets command exports secretsCommand", async () => {
            const mod = await import("../../../src/cli/commands/secrets.js");
            expect(typeof mod.secretsCommand).toBe("function");
        });

        it("git command exports commit and sync handlers", async () => {
            const mod = await import("../../../src/cli/commands/git.js");
            expect(typeof mod.gitCommitCommand).toBe("function");
            expect(typeof mod.gitSyncCommand).toBe("function");
        });

        it("worktree command exports worktreeCommand", async () => {
            const mod = await import("../../../src/cli/commands/worktree.js");
            expect(typeof mod.worktreeCommand).toBe("function");
        });

        it("script command exports runScriptCommand", async () => {
            const mod = await import("../../../src/cli/commands/script.js");
            expect(typeof mod.runScriptCommand).toBe("function");
        });

        it("security command exports securityAuditCommand", async () => {
            const mod = await import("../../../src/cli/commands/security.js");
            expect(typeof mod.securityAuditCommand).toBe("function");
        });
    });

    describe("functional smoke", () => {
        it("secrets vault: set → get → list → delete round-trip", async () => {
            const mod = await import("../../../src/cli/commands/secrets.js");
            // The vault operates on the framework dir resolved via
            // ATABEY_TEST_DIR; the command prints results to stdout.
            await expect(
                mod.secretsCommand(["set", "SMOKE_KEY", "smoke-value-123"]),
            ).resolves.not.toThrow();

            await expect(
                mod.secretsCommand(["get", "SMOKE_KEY"]),
            ).resolves.not.toThrow();

            await expect(
                mod.secretsCommand(["list"]),
            ).resolves.not.toThrow();

            await expect(
                mod.secretsCommand(["delete", "SMOKE_KEY"]),
            ).resolves.not.toThrow();
        });

        it("db status runs against the temporary framework dir", async () => {
            const mod = await import("../../../src/cli/commands/db.js");
            await expect(mod.dbCommand(["status"])).resolves.not.toThrow();
        });
    });
});
