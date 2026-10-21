import cp from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtabeyStorage } from "atabey-shared/storage.js";
import { gitCiStatusCommand } from "../../../src/cli/commands/git.js";

/**
 * [B1] Tests for the CI feedback loop (`atabey git ci-status`).
 * The GitHub CLI is mocked; the Hermes CI_RESULT feedback is verified
 * against a real temporary framework dir.
 */
describe("git ci-status command (B1 CI feedback loop)", () => {
    let tempDir: string;
    let execSpy: ReturnType<typeof vi.spyOn>;
    let spawnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-cistatus-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        AtabeyStorage.reset();
        process.exitCode = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        AtabeyStorage.reset();
        delete process.env.ATABEY_TEST_DIR;
        process.exitCode = 0;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    const mockGh = (checks: Array<{ name: string; state: string; link?: string }>) => {
        spawnSpy = vi.spyOn(cp, "spawnSync").mockReturnValue({ status: 0 } as unknown as cp.SpawnSyncReturns<string>);
        execSpy = vi.spyOn(cp, "execSync").mockReturnValue(JSON.stringify(checks));
    };

    it("exits with usage error when gh is not installed", async () => {
        vi.spyOn(cp, "spawnSync").mockReturnValue({ status: 127 } as unknown as cp.SpawnSyncReturns<string>);
        await gitCiStatusCommand([]);
        expect(process.exitCode).toBe(64);
    });

    it("feeds a GREEN CI result back to @manager via Hermes", async () => {
        mockGh([
            { name: "unit-tests", state: "pass" },
            { name: "lint", state: "pass" },
        ]);
        await gitCiStatusCommand(["42", "--agent", "@backend"]);

        const pending = AtabeyStorage.getPendingMessages();
        const ciMsg = pending.find((m) => m.category === "CI_RESULT");
        expect(ciMsg).toBeDefined();
        expect(ciMsg!.to).toBe("backend");
        expect(ciMsg!.from).toBe("devops");
        const payload = JSON.parse(ciMsg!.content) as { overall: string; passing: number; total: number };
        expect(payload.overall).toBe("GREEN");
        expect(payload.passing).toBe(2);
        expect(payload.total).toBe(2);
    });

    it("feeds a RED CI result with failing checks and HIGH priority", async () => {
        mockGh([
            { name: "unit-tests", state: "pass" },
            { name: "integration", state: "fail", link: "https://example.com/log" },
        ]);
        await gitCiStatusCommand(["42"]);

        const pending = AtabeyStorage.getPendingMessages();
        const ciMsg = pending.find((m) => m.category === "CI_RESULT");
        expect(ciMsg).toBeDefined();
        expect(ciMsg!.priority).toBe("HIGH");
        const payload = JSON.parse(ciMsg!.content) as {
            overall: string;
            failingChecks: Array<{ name: string; state: string }>;
        };
        expect(payload.overall).toBe("RED");
        expect(payload.failingChecks).toEqual([{ name: "integration", state: "fail", link: "https://example.com/log" }]);
    });

    it("reports cleanly when the PR has no checks yet", async () => {
        mockGh([]);
        await gitCiStatusCommand([]);
        expect(AtabeyStorage.getPendingMessages()).toHaveLength(0);
    });
});
