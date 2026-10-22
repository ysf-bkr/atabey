import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Regression test for the `atabey check` exit code after a fresh init.
 * Bug (v0.1.6-rc): check hardcoded the legacy root `mcp.json` while init
 * writes `.mcp.json` — every fresh install exited 1 and CI was red.
 */
describe("check command regression (init → check must be green)", () => {
    let tempDir: string;
    let prevAntigravityDir: string | undefined;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || "/tmp"), "atabey-check-regression-"));
        prevAntigravityDir = process.env.ANTIGRAVITY_GLOBAL_DIR;
        process.env.ANTIGRAVITY_GLOBAL_DIR = path.join(tempDir, ".antigravity-global");
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (prevAntigravityDir === undefined) {
            delete process.env.ANTIGRAVITY_GLOBAL_DIR;
        } else {
            process.env.ANTIGRAVITY_GLOBAL_DIR = prevAntigravityDir;
        }
        vi.restoreAllMocks();
    });

    it("init all → check exits 0 (MCP config found via .mcp.json)", () => {
        const cliDist = path.resolve(__dirname, "../../dist/atabey/src/cli/index.js");
        if (!fs.existsSync(cliDist)) {
            throw new Error(`Built CLI not found at ${cliDist} — run \`npm run build\` first.`);
        }

        // init all --yes in the fresh temp project
        execFileSync("node", [cliDist, "init", "all", "--yes"], {
            cwd: tempDir,
            stdio: "pipe",
            timeout: 120_000,
            env: { ...process.env, ATABEY_TEST_DIR: path.join(tempDir, ".atabey") },
        });

        // The root MCP config must be the standard .mcp.json (not legacy mcp.json)
        expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(true);
        expect(fs.existsSync(path.join(tempDir, "mcp.json"))).toBe(false);

        // check must exit 0 — the previous bug exited 1 here.
        let exitCode = 0;
        let stderr = "";
        try {
            execFileSync("node", [cliDist, "check"], {
                cwd: tempDir,
                stdio: "pipe",
                timeout: 120_000,
                env: { ...process.env, ATABEY_TEST_DIR: path.join(tempDir, ".atabey") },
            });
        } catch (err) {
            const e = err as { status?: number; stderr?: string };
            exitCode = e.status ?? 1;
            stderr = e.stderr?.toString() ?? "";
        }
        expect(stderr).toBe("");
        expect(exitCode).toBe(0);
    }, 180_000);
});
