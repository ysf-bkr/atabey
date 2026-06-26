import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EvaluationEngine } from "../../../src/modules/engines/evaluation-engine.js";

describe("EvaluationEngine", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-eval-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        vi.stubGlobal("process", { ...process, cwd: () => tempDir });
        fs.mkdirSync(path.join(tempDir, "memory"), { recursive: true });
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        vi.unstubAllGlobals();
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should evaluate a task and return score 0-100", () => {
        const result = EvaluationEngine.evaluateTask("T-001", "@backend", 5000);
        expect(result.traceId).toBe("T-001");
        expect(result.agent).toBe("backend");
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
    });

    it("should include metrics in evaluation result", () => {
        const result = EvaluationEngine.evaluateTask("T-002", "@quality", 10000);
        expect(result.metrics).toBeDefined();
        expect(result.metrics).toHaveProperty("compilation");
        expect(result.metrics).toHaveProperty("lint");
        expect(result.metrics).toHaveProperty("tests");
        expect(result.metrics).toHaveProperty("compliance");
    });

    it("should track duration", () => {
        const result = EvaluationEngine.evaluateTask("T-003", "@backend", 150000);
        expect(result.durationMs).toBe(150000);
    });

    it("should return timestamp in ISO format", () => {
        const result = EvaluationEngine.evaluateTask("T-004", "@devops", 500);
        expect(() => new Date(result.timestamp)).not.toThrow();
        expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
});
