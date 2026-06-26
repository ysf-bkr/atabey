import { beforeEach, describe, expect, it, vi } from "vitest";
import * as memoryUtils from "../../src/cli/utils/memory.js";
import { EvaluationEngine } from "../../src/modules/engines/evaluation-engine.js";
import * as fsUtils from "../../src/shared/fs.js";

// Mock fs to prevent real command execution
vi.mock("fs", () => ({
    default: {
        existsSync: vi.fn().mockReturnValue(false),
        readFileSync: vi.fn().mockReturnValue(""),
        writeFileSync: vi.fn(),
        mkdirSync: vi.fn(),
        readdirSync: vi.fn().mockReturnValue([]),
        statSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(""),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn(),
}));

describe("EvaluationEngine", () => {
    beforeEach(() => {
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue("/tmp/test-atabey");
        vi.spyOn(fsUtils, "ensureDir").mockImplementation(() => {});
        vi.spyOn(fsUtils, "writeTextFile").mockImplementation(() => {});
        vi.spyOn(fsUtils, "appendFile").mockImplementation(() => {});
        vi.spyOn(fsUtils, "runCommandQuiet").mockImplementation(() => {});
    });

    describe("evaluateTask", () => {
        it("should return an EvaluationResult with correct structure", () => {
            const result = EvaluationEngine.evaluateTask("T-001", "@backend", 1000);
            expect(result).toHaveProperty("traceId");
            expect(result).toHaveProperty("agent");
            expect(result).toHaveProperty("score");
            expect(result).toHaveProperty("metrics");
            expect(result).toHaveProperty("durationMs");
            expect(result).toHaveProperty("timestamp");
        });

        it("should set agent name without @ prefix", () => {
            const result = EvaluationEngine.evaluateTask("T-001", "@backend", 1000);
            expect(result.agent).toBe("backend");
        });

        it("should return a score between 0 and 100", () => {
            const result = EvaluationEngine.evaluateTask("T-001", "@backend", 1000);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(100);
        });

        it("should record durationMs correctly", () => {
            const result = EvaluationEngine.evaluateTask("T-001", "@backend", 5000);
            expect(result.durationMs).toBe(5000);
        });

        it("should have metrics object with all required fields", () => {
            const result = EvaluationEngine.evaluateTask("T-001", "@backend", 1000);
            expect(result.metrics).toHaveProperty("compilation");
            expect(result.metrics).toHaveProperty("lint");
            expect(result.metrics).toHaveProperty("tests");
            expect(result.metrics).toHaveProperty("compliance");
        });

        it("should penalize long-running tasks", () => {
            const fastResult = EvaluationEngine.evaluateTask("T-001", "@backend", 1000);
            const slowResult = EvaluationEngine.evaluateTask("T-002", "@backend", 130000);
            expect(slowResult.score).toBeLessThanOrEqual(fastResult.score);
        });

        it("should handle different agent names", () => {
            const result = EvaluationEngine.evaluateTask("T-003", "@frontend", 2000);
            expect(result.agent).toBe("frontend");
        });
    });
});
