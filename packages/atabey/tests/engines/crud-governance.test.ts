import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GovernanceEngine } from "../../src/modules/engines/crud-governance.js";
import { AtabeyStorage } from "../../src/shared/storage.js";
import fs from "fs";
import path from "path";
import os from "os";

describe("GovernanceEngine Dynamic Config", () => {
    let tempDir: string;
    let originalTestDir: string | undefined;

    beforeEach(() => {
        originalTestDir = process.env.ATABEY_TEST_DIR;
        tempDir = path.join(os.tmpdir(), `atabey-gov-test-${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });
        process.env.ATABEY_TEST_DIR = tempDir;
        AtabeyStorage.reset();
    });

    afterEach(() => {
        if (originalTestDir) {
            process.env.ATABEY_TEST_DIR = originalTestDir;
        } else {
            delete process.env.ATABEY_TEST_DIR;
        }
        AtabeyStorage.reset();
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (e) {
            // ignore cleanup errors
        }
    });

    it("should fall back to default authorized agents when config.json does not exist", async () => {
        const decision = await GovernanceEngine.evaluate(
            "@database",
            "SCHEMA_CHANGE",
            "Alter user table structure",
            "T-1"
        );
        // By default, database is authorized for SCHEMA_CHANGE, but still high-risk so it requires approval
        expect(decision.allowed).toBe(false);
        expect(decision.requiresApproval).toBe(true);
        expect(decision.reason).toContain("requires human approval (risk score: 70)");
    });

    it("should restrict operations to agents specified in config.json", async () => {
        // Write customized config where only @manager can make schema changes
        const config = {
            governance: {
                authorizedAgents: {
                    SCHEMA_CHANGE: ["@manager"]
                },
                operationRisk: {
                    SCHEMA_CHANGE: 99
                }
            }
        };
        fs.writeFileSync(path.join(tempDir, "config.json"), JSON.stringify(config), "utf8");

        // Database agent should now be blocked (unauthorized)
        const blockDecision = await GovernanceEngine.evaluate(
            "@database",
            "SCHEMA_CHANGE",
            "Alter user table structure",
            "T-2"
        );
        expect(blockDecision.allowed).toBe(false);
        expect(blockDecision.requiresApproval).toBe(true);
        expect(blockDecision.reason).toContain("is not authorized for SCHEMA_CHANGE");

        // Manager agent should be authorized, but still gets sent for approval with customized risk score (99)
        const okDecision = await GovernanceEngine.evaluate(
            "@manager",
            "SCHEMA_CHANGE",
            "Alter user table structure",
            "T-3"
        );
        expect(okDecision.allowed).toBe(false);
        expect(okDecision.requiresApproval).toBe(true);
        expect(okDecision.reason).toContain("requires human approval (risk score: 99)");
    });
});
