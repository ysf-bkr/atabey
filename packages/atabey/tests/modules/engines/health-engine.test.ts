import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as memoryUtils from "../../../src/cli/utils/memory.js";
import { HealthEngine } from "../../../src/modules/engines/health-engine.js";
import { Storage } from "../../../src/shared/storage.js";

describe("HealthEngine", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-health-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(path.join(tempDir, "memory"));
        fs.mkdirSync(path.join(tempDir, "memory"), { recursive: true });
        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should update project health and return a ProjectHealth object", async () => {
        const health = await HealthEngine.updateProjectHealth();
        expect(health).toBeDefined();
        expect(health.score).toBeGreaterThanOrEqual(0);
        expect(health.score).toBeLessThanOrEqual(100);
        expect(health.codeQuality).toBeGreaterThanOrEqual(0);
        expect(health.lastUpdated).toBeDefined();
    });

    it("should include total agent count", async () => {
        Storage.updateAgentStatus("manager", "ACTIVE", "Idle");
        Storage.updateAgentStatus("backend", "READY", "Idle");
        const health = await HealthEngine.updateProjectHealth();
        expect(health.totalAgents).toBe(2);
    });

    it("should detect blocked agents and penalize score", async () => {
        Storage.updateAgentStatus("backend", "BLOCKED", "Failed task");
        const health = await HealthEngine.updateProjectHealth();
        expect(health.blockedAgents).toBeGreaterThanOrEqual(1);
    });

    it("should return null when getHealth is called before update", () => {
        const health = HealthEngine.getHealth();
        expect(health).toBeNull();
    });

    it("should persist health to JSON file", async () => {
        await HealthEngine.updateProjectHealth();
        const healthFile = path.join(tempDir, "memory", "HEALTH.json");
        expect(fs.existsSync(healthFile)).toBe(true);
        const content = JSON.parse(fs.readFileSync(healthFile, "utf8"));
        expect(content.score).toBeDefined();
    });
});
