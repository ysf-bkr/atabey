import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { verifyWritePermission } from "../../../src/utils/permissions.js";

describe("Permissions Matrix Scanner", () => {
    let tempDir: string;
    let frameworkDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-perm-test-"));
        frameworkDir = path.join(tempDir, ".atabey");
        fs.mkdirSync(frameworkDir, { recursive: true });
        fs.mkdirSync(path.join(frameworkDir, "memory"), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should allow write if no permission-matrix.json exists", () => {
        expect(() => {
            verifyWritePermission(tempDir, "apps/web/index.ts");
        }).not.toThrow();
    });

    it("should enforce write matrix restrictions for the active executing agent", () => {
        // Create permission-matrix.json
        const matrix = {
            "@frontend": {
                write: ["apps/web/**"]
            },
            "@backend": {
                write: ["apps/backend/**"]
            }
        };
        fs.writeFileSync(path.join(frameworkDir, "permission-matrix.json"), JSON.stringify(matrix, null, 2));

        // Set active agent to @frontend in status.json
        const status = {
            "frontend": {
                state: "EXECUTING",
                task: "Build client application",
                lastUpdated: new Date().toISOString()
            }
        };
        fs.writeFileSync(path.join(frameworkDir, "memory", "status.json"), JSON.stringify(status, null, 2));

        // 1. Should ALLOW @frontend to write within apps/web/**
        expect(() => {
            verifyWritePermission(tempDir, "apps/web/components/Button.tsx");
        }).not.toThrow();

        // 2. Should DENY @frontend from writing to apps/backend/**
        expect(() => {
            verifyWritePermission(tempDir, "apps/backend/routes/api.ts");
        }).toThrow(/Permission Denied/);
    });

    it("should allow write if the executing agent has no restrictions defined", () => {
        // Create matrix with rules only for @frontend
        const matrix = {
            "@frontend": {
                write: ["apps/web/**"]
            }
        };
        fs.writeFileSync(path.join(frameworkDir, "permission-matrix.json"), JSON.stringify(matrix, null, 2));

        // Set active agent to @backend (who has no rules in matrix)
        const status = {
            "backend": {
                state: "EXECUTING",
                task: "Run migrations"
            }
        };
        fs.writeFileSync(path.join(frameworkDir, "memory", "status.json"), JSON.stringify(status, null, 2));

        expect(() => {
            verifyWritePermission(tempDir, "apps/backend/schema.ts");
        }).not.toThrow();
    });

    it("should default to allow if no agent is currently in EXECUTING state", () => {
        const matrix = {
            "@frontend": {
                write: ["apps/web/**"]
            }
        };
        fs.writeFileSync(path.join(frameworkDir, "permission-matrix.json"), JSON.stringify(matrix, null, 2));

        // Status lists everyone as READY
        const status = {
            "frontend": {
                state: "READY",
                task: "Idle"
            }
        };
        fs.writeFileSync(path.join(frameworkDir, "memory", "status.json"), JSON.stringify(status, null, 2));

        expect(() => {
            verifyWritePermission(tempDir, "apps/backend/schema.ts");
        }).not.toThrow();
    });
});
