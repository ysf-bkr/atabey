import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { verifyWritePermission, verifyReadPermission, verifyMessagingPermission } from "../../../../src/mcp/utils/permissions.js";

/**
 * Permissions Matrix + RBAC test suite
 *
 * Tests cover:
 * 1. Write permission enforcement (file-system matrix)
 * 2. Read permission enforcement (read-side matrix)
 * 3. AgentTier messaging RBAC (core → recon delegation block)
 * 4. Recon write default-deny
 * 5. Supreme tier omni-access
 * 6. ATABEY_ACTIVE_AGENT env var resolution
 */
describe("Permissions Matrix + AgentTier RBAC", () => {
    let tempDir: string;
    let frameworkDir: string;

    // Helper: write status.json with the given agent in EXECUTING state
    function setExecutingAgent(agentName: string) {
        const key = agentName.replace("@", "");
        const status = {
            [key]: { state: "EXECUTING", task: "test", lastUpdated: new Date().toISOString() }
        };
        fs.writeFileSync(path.join(frameworkDir, "memory", "status.json"), JSON.stringify(status, null, 2));
    }

    // Helper: write permission-matrix.json
    function setMatrix(matrix: object) {
        fs.writeFileSync(path.join(frameworkDir, "permission-matrix.json"), JSON.stringify(matrix, null, 2));
    }

    // Helper: set ATABEY_ACTIVE_AGENT env and clean up
    function withEnvAgent(agent: string, fn: () => void) {
        const prev = process.env.ATABEY_ACTIVE_AGENT;
        process.env.ATABEY_ACTIVE_AGENT = agent;
        try { fn(); } finally {
            if (prev === undefined) delete process.env.ATABEY_ACTIVE_AGENT;
            else process.env.ATABEY_ACTIVE_AGENT = prev;
        }
    }

    beforeEach(() => {
        // Ensure env agent is cleared before each test
        delete process.env.ATABEY_ACTIVE_AGENT;

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-perm-test-"));
        frameworkDir = path.join(tempDir, ".atabey");
        fs.mkdirSync(frameworkDir, { recursive: true });
        fs.mkdirSync(path.join(frameworkDir, "memory"), { recursive: true });
    });

    afterEach(() => {
        delete process.env.ATABEY_ACTIVE_AGENT;
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ─── Write Permission ────────────────────────────────────────────────────

    describe("verifyWritePermission", () => {
        it("should allow write if no permission-matrix.json exists", () => {
            expect(() => verifyWritePermission(tempDir, "apps/web/index.ts")).not.toThrow();
        });

        it("should enforce write matrix restrictions for the active executing agent", () => {
            setMatrix({
                "@frontend": { write: ["apps/web/**"] },
                "@backend":  { write: ["apps/backend/**"] }
            });
            setExecutingAgent("@frontend");

            // ALLOW: @frontend writes within apps/web/**
            expect(() => verifyWritePermission(tempDir, "apps/web/components/Button.tsx")).not.toThrow();

            // DENY: @frontend writes to apps/backend/**
            expect(() => verifyWritePermission(tempDir, "apps/backend/routes/api.ts")).toThrow(/Permission Denied/);
        });

        it("should allow write if the executing agent has no restrictions defined in matrix", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"] } });
            setExecutingAgent("@backend");
            // @backend has no matrix entry → default-allow
            expect(() => verifyWritePermission(tempDir, "apps/backend/schema.ts")).not.toThrow();
        });

        it("should default to allow if no agent is currently in EXECUTING state", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"] } });
            const status = { "frontend": { state: "READY", task: "Idle" } };
            fs.writeFileSync(path.join(frameworkDir, "memory", "status.json"), JSON.stringify(status));
            expect(() => verifyWritePermission(tempDir, "apps/backend/schema.ts")).not.toThrow();
        });

        it("ATABEY_ACTIVE_AGENT env var takes priority over status.json", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"] } });
            // status.json says backend is executing
            setExecutingAgent("@backend");
            // But env var says frontend
            withEnvAgent("@frontend", () => {
                // Should apply @frontend rules → deny backend write
                expect(() => verifyWritePermission(tempDir, "apps/backend/schema.ts")).toThrow(/Permission Denied/);
            });
        });
    });

    // ─── Read Permission ─────────────────────────────────────────────────────

    describe("verifyReadPermission", () => {
        it("should allow read if no permission-matrix.json exists", () => {
            expect(() => verifyReadPermission(tempDir, "apps/backend/secret.ts")).not.toThrow();
        });

        it("should allow read if agent has no read rules in matrix (default-allow)", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"] } }); // no read field
            setExecutingAgent("@frontend");
            expect(() => verifyReadPermission(tempDir, "apps/backend/secret.ts")).not.toThrow();
        });

        it("should enforce read matrix when read rules are defined", () => {
            setMatrix({
                "@frontend": {
                    write: ["apps/web/**"],
                    read:  ["apps/web/**", "docs/**"]
                }
            });
            setExecutingAgent("@frontend");

            // ALLOW: reads within allowed read paths
            expect(() => verifyReadPermission(tempDir, "apps/web/index.ts")).not.toThrow();
            expect(() => verifyReadPermission(tempDir, "docs/README.md")).not.toThrow();

            // DENY: reads outside allowed read paths
            expect(() => verifyReadPermission(tempDir, "apps/backend/config.ts")).toThrow(/Permission Denied/);
        });

        it("should allow read even with no agent in EXECUTING state", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"], read: ["apps/web/**"] } });
            // No status.json → no active agent → default-allow
            expect(() => verifyReadPermission(tempDir, "apps/backend/secret.ts")).not.toThrow();
        });
    });

    // ─── Recon Tier Write Default-Deny ──────────────────────────────────────

    describe("Recon tier — write default-deny", () => {
        it("recon agent (@explorer) cannot write when no matrix entry exists", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"] } }); // no @explorer entry
            withEnvAgent("@explorer", () => {
                expect(() => verifyWritePermission(tempDir, "apps/web/index.ts")).toThrow(/Permission Denied.*recon/i);
            });
        });

        it("recon agent (@git) can write if explicitly allowed in matrix", () => {
            setMatrix({ "@git": { write: ["docs/**"] } });
            withEnvAgent("@git", () => {
                expect(() => verifyWritePermission(tempDir, "docs/CHANGELOG.md")).not.toThrow();
                expect(() => verifyWritePermission(tempDir, "apps/backend/api.ts")).toThrow(/Permission Denied/);
            });
        });

        it("recon agent can always read (default-allow for reads)", () => {
            setMatrix({ "@frontend": { write: ["apps/web/**"] } }); // no @explorer entry
            withEnvAgent("@explorer", () => {
                expect(() => verifyReadPermission(tempDir, "apps/backend/secret.ts")).not.toThrow();
            });
        });
    });

    // ─── Supreme Tier Omni-Access ────────────────────────────────────────────

    describe("Supreme tier — omni-access", () => {
        it("@manager (supreme) can write anywhere regardless of matrix", () => {
            setMatrix({ "@manager": { write: ["docs/**"] } }); // restrictive matrix for manager
            withEnvAgent("@manager", () => {
                // Even with a restrictive matrix, supreme bypasses it
                expect(() => verifyWritePermission(tempDir, "apps/backend/database.ts")).not.toThrow();
            });
        });

        it("@security (supreme) can read anywhere regardless of matrix", () => {
            setMatrix({ "@security": { read: ["docs/**"] } });
            withEnvAgent("@security", () => {
                expect(() => verifyReadPermission(tempDir, "apps/backend/auth/secrets.ts")).not.toThrow();
            });
        });
    });

    // ─── AgentTier Messaging RBAC ────────────────────────────────────────────

    describe("verifyMessagingPermission — AgentTier hierarchy", () => {
        it("core → core messaging is allowed", () => {
            expect(() => verifyMessagingPermission("@frontend", "@backend")).not.toThrow();
        });

        it("recon → core messaging is allowed (escalation up)", () => {
            expect(() => verifyMessagingPermission("@explorer", "@backend")).not.toThrow();
        });

        it("supreme → any messaging is allowed", () => {
            expect(() => verifyMessagingPermission("@manager", "@explorer")).not.toThrow();
            expect(() => verifyMessagingPermission("@security", "@git")).not.toThrow();
        });

        it("core → recon messaging is BLOCKED (prevents quality-gate bypass)", () => {
            expect(() => verifyMessagingPermission("@frontend", "@explorer"))
                .toThrow(/RBAC.*Messaging violation.*tier: core.*tier: recon/i);
        });

        it("core → recon: @backend cannot delegate to @git", () => {
            expect(() => verifyMessagingPermission("@backend", "@git"))
                .toThrow(/RBAC.*Messaging violation/i);
        });

        it("core → recon: @quality cannot delegate to @analyst", () => {
            expect(() => verifyMessagingPermission("@quality", "@analyst"))
                .toThrow(/RBAC.*Messaging violation/i);
        });

        it("any → supreme messaging is allowed (escalation always permitted)", () => {
            expect(() => verifyMessagingPermission("@explorer", "@manager")).not.toThrow();
            expect(() => verifyMessagingPermission("@git", "@security")).not.toThrow();
        });
    });
});
