import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Security-relevant Control Plane handlers: agent registration (privilege
 * escalation guard) and resource locking (ownership enforcement). These are the
 * parts of the tool surface that back the "deny-by-default" governance claim, so
 * they get explicit coverage here.
 */
describe("control plane tools", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-control-plane-"));
        fs.mkdirSync(path.join(dir, ".atabey"), { recursive: true });
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe("register_agent", () => {
        it("registers a core agent and writes the registry file", async () => {
            const { handleRegisterAgent } = await import(
                "../../../src/mcp/tools/control_plane/registry.js"
            );
            const res = await handleRegisterAgent(dir, { agent: "@backend", role: "core", capability: 7 });

            expect(res.isError).toBeUndefined();
            expect(res.content[0].text).toContain("@backend");
            const file = path.join(dir, ".atabey", "registry", "backend_active.json");
            expect(fs.existsSync(file)).toBe(true);
            const data = JSON.parse(fs.readFileSync(file, "utf8"));
            expect(data).toMatchObject({ agent: "@backend", role: "core", capability: 7, status: "ACTIVE" });
        });

        it("clamps capability into the 1..10 range", async () => {
            const { handleRegisterAgent } = await import(
                "../../../src/mcp/tools/control_plane/registry.js"
            );
            await handleRegisterAgent(dir, { agent: "@git", role: "recon", capability: 99 });
            const file = path.join(dir, ".atabey", "registry", "git_active.json");
            expect(JSON.parse(fs.readFileSync(file, "utf8")).capability).toBe(10);

            await handleRegisterAgent(dir, { agent: "@git", role: "recon", capability: -5 });
            expect(JSON.parse(fs.readFileSync(file, "utf8")).capability).toBe(1);
        });

        it("rejects an invalid role", async () => {
            const { handleRegisterAgent } = await import(
                "../../../src/mcp/tools/control_plane/registry.js"
            );
            const res = await handleRegisterAgent(dir, { agent: "@backend", role: "admin" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("[RBAC] Invalid role");
        });

        it("blocks privilege escalation to supreme for non-whitelisted agents", async () => {
            const { handleRegisterAgent } = await import(
                "../../../src/mcp/tools/control_plane/registry.js"
            );
            const res = await handleRegisterAgent(dir, { agent: "@backend", role: "supreme" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("Privilege escalation blocked");
            expect(fs.existsSync(path.join(dir, ".atabey", "registry", "backend_active.json"))).toBe(false);
        });

        it("allows the whitelisted supreme agents to register as supreme", async () => {
            const { handleRegisterAgent } = await import(
                "../../../src/mcp/tools/control_plane/registry.js"
            );
            for (const agent of ["@manager", "@security"]) {
                const res = await handleRegisterAgent(dir, { agent, role: "supreme" });
                expect(res.isError).toBeUndefined();
                expect(res.content[0].text).toContain("supreme");
            }
        });

        it("preserves specialties and registered_at on re-registration", async () => {
            const { handleRegisterAgent } = await import(
                "../../../src/mcp/tools/control_plane/registry.js"
            );
            await handleRegisterAgent(dir, {
                agent: "@frontend",
                role: "core",
                specialties: { react: 8 },
            });
            const file = path.join(dir, ".atabey", "registry", "frontend_active.json");
            const first = JSON.parse(fs.readFileSync(file, "utf8"));

            await handleRegisterAgent(dir, {
                agent: "@frontend",
                role: "core",
                specialties: { css: 6 },
            });
            const second = JSON.parse(fs.readFileSync(file, "utf8"));
            expect(second.specialties).toMatchObject({ react: 8, css: 6 });
            expect(second.registered_at).toBe(first.registered_at);
        });
    });

    describe("acquire_lock / release_lock", () => {
        it("acquires a lock and reports the holder", async () => {
            const { handleAcquireLock } = await import("../../../src/mcp/tools/control_plane/locking.js");
            const res = await handleAcquireLock(dir, { resource: "PROJECT_MEMORY.md", agent: "@backend" });
            expect(res.isError).toBeUndefined();
            expect(res.content[0].text).toContain("Lock acquired");
        });

        it("denies a second agent while the lock is held", async () => {
            const { handleAcquireLock } = await import("../../../src/mcp/tools/control_plane/locking.js");
            await handleAcquireLock(dir, { resource: "file.ts", agent: "@backend" });
            const res = await handleAcquireLock(dir, { resource: "file.ts", agent: "@frontend" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("[LOCKED]");
            expect(res.content[0].text).toContain("@backend");
        });

        it("releases a lock only for its owner", async () => {
            const { handleAcquireLock, handleReleaseLock } = await import(
                "../../../src/mcp/tools/control_plane/locking.js"
            );
            await handleAcquireLock(dir, { resource: "shared.ts", agent: "@backend" });

            const denied = await handleReleaseLock(dir, { resource: "shared.ts", agent: "@frontend" });
            expect(denied.isError).toBe(true);
            expect(denied.content[0].text).toContain("do not own the lock");

            const ok = await handleReleaseLock(dir, { resource: "shared.ts", agent: "@backend" });
            expect(ok.isError).toBeUndefined();
            expect(ok.content[0].text).toContain("Lock released");
        });

        it("reports a missing lock on release", async () => {
            const { handleReleaseLock } = await import("../../../src/mcp/tools/control_plane/locking.js");
            const res = await handleReleaseLock(dir, { resource: "never-locked", agent: "@backend" });
            expect(res.isError).toBeUndefined();
            expect(res.content[0].text).toContain("No lock found");
        });
    });
});
