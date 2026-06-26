import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { statusCommand } from "../src/cli/commands/status.js";
import * as memoryUtils from "../src/cli/utils/memory.js";

describe("Status Cost Dashboard", () => {
    let tempDir: string;
    let memoryDir: string;
    let observabilityDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-status-cost-"));
        memoryDir = path.join(tempDir, "memory");
        observabilityDir = path.join(tempDir, "observability");

        fs.mkdirSync(memoryDir, { recursive: true });
        fs.mkdirSync(observabilityDir, { recursive: true });

        process.env.ATABEY_TEST_DIR = tempDir;
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(memoryDir);

        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should print aggregated token metrics and estimated cost from metrics.json", async () => {
        const mockMetrics = [
            { timestamp: new Date().toISOString(), agent: "@backend", action: "write_file: src/index.ts", estimatedTokens: 100000 },
            { timestamp: new Date().toISOString(), agent: "@frontend", action: "replace_text: apps/web/index.html", estimatedTokens: 50000 }
        ];
        fs.writeFileSync(path.join(observabilityDir, "metrics.json"), JSON.stringify(mockMetrics, null, 2));

        const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

        await statusCommand();

        expect(stdoutSpy).toHaveBeenCalled();
        const calls = stdoutSpy.mock.calls.map(call => String(call[0]));

        expect(calls.some(c => c.includes("Total Estimated Tokens:"))).toBe(true);
        expect(calls.some(c => c.includes("Total Estimated LLM Cost:"))).toBe(true);
        expect(calls.some(c => c.includes("Weekly Estimated Tokens (Last 7 days):"))).toBe(true);
        expect(calls.some(c => c.includes("Weekly Estimated LLM Cost (Last 7 days):"))).toBe(true);
        expect(calls.some(c => c.includes("@backend"))).toBe(true);
        expect(calls.some(c => c.includes("@frontend"))).toBe(true);

        stdoutSpy.mockRestore();
    });
});
