import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { isHighRiskOperation, verifyRiskAndAwaitApproval } from "../../../../src/mcp/utils/compliance.js";

describe("Policy Engine - High Risk Assessment & Human Approval", () => {
    let tempDir: string;
    let frameworkDir: string;
    let messagesDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-risk-test-"));
        frameworkDir = path.join(tempDir, ".atabey");
        messagesDir = path.join(frameworkDir, "messages");
        
        fs.mkdirSync(frameworkDir, { recursive: true });
        fs.mkdirSync(path.join(frameworkDir, "memory"), { recursive: true });
        fs.mkdirSync(messagesDir, { recursive: true });
        
        process.env.ATABEY_TEST_DIR = frameworkDir;
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should correctly identify database deletions as high risk", () => {
        const sqlContent = "DROP TABLE users;";
        const tsContent = "const q = 'DROP DATABASE prod;';";
        const safeContent = "SELECT * FROM users;";

        expect(isHighRiskOperation(sqlContent, "schema.sql").isRisk).toBe(true);
        expect(isHighRiskOperation(tsContent, "db.ts").isRisk).toBe(true);
        expect(isHighRiskOperation(safeContent, "query.sql").isRisk).toBe(false);
    });

    it("should identify package.json dependency modifications as high risk", () => {
        const pkgContent = JSON.stringify({
            dependencies: {
                "express": "^4.18.2"
            }
        });
        expect(isHighRiskOperation(pkgContent, "package.json").isRisk).toBe(true);
    });

    it("should identify infrastructure script mutations as high risk", () => {
        const dockerContent = "FROM node:18\nRUN npm install";
        const deploySh = "#!/bin/bash\n/usr/bin/deploy.sh";

        expect(isHighRiskOperation(dockerContent, "Dockerfile").isRisk).toBe(true);
        expect(isHighRiskOperation(deploySh, "scripts/deploy.sh").isRisk).toBe(true);
    });

    it("should write WAITING_FOR_APPROVAL status and block/await approval in polling loop", async () => {
        const statusPath = path.join(frameworkDir, "memory", "status.json");
        const statePath = path.join(frameworkDir, "memory", "state.json");
        const managerMsgPath = path.join(messagesDir, "manager.json");

        // Set state
        fs.writeFileSync(statePath, JSON.stringify({ traceId: "T-RISK-999" }));

        // Set active agent executing
        const status = {
            "backend": {
                state: "EXECUTING",
                task: "Refactoring API"
            }
        };
        fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));

        // Simulate a background process that approves the transaction after 1.5 seconds
        setTimeout(() => {
            if (fs.existsSync(managerMsgPath)) {
                const lines = fs.readFileSync(managerMsgPath, "utf8").trim().split("\n");
                const newLines = lines.map(l => {
                    const parsed = JSON.parse(l);
                    if (parsed.traceId === "T-RISK-999") {
                        parsed.status = "APPROVED";
                    }
                    return JSON.stringify(parsed);
                });
                fs.writeFileSync(managerMsgPath, newLines.join("\n") + "\n");
            }
        }, 1500);

        // Run verifyRiskAndAwaitApproval with high-risk content
        const start = Date.now();
        await verifyRiskAndAwaitApproval(tempDir, "DROP TABLE sensitive_data;", "schema.sql");

        const duration = Date.now() - start;
        expect(duration).toBeGreaterThanOrEqual(1400);

        // Verify status is reverted to EXECUTING
        const updatedStatus = JSON.parse(fs.readFileSync(statusPath, "utf8"));
        expect(updatedStatus.backend.state).toBe("EXECUTING");
    });
});
