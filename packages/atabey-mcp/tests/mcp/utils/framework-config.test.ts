import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    applyAuthEnvFromConfig,
    applySandboxEnvFromConfig,
    loadFrameworkConfig,
    resolveAuthConfig,
    resolveComplianceConfig,
    resolveSandboxConfig,
} from "../../../src/mcp/utils/framework-config.js";

/**
 * Precedence contract for `.atabey/config.json`:
 *
 *   explicit config section  >  legacy `profile` defaults  >  hardcoded fallback
 *
 * and, for the env-applying helpers, an already-set environment variable always
 * wins so operators can override a config file at launch time.
 *
 * `profile` is legacy: `atabey init` writes explicit `sandbox`/`auth`/`compliance`
 * sections and no `profile`, so the tier defaults only affect projects scaffolded
 * by older versions.
 */
describe("framework-config", () => {
    let root: string;
    const savedEnv = { ...process.env };

    const writeConfig = (cfg: unknown) => {
        fs.mkdirSync(path.join(root, ".atabey"), { recursive: true });
        fs.writeFileSync(path.join(root, ".atabey", "config.json"), JSON.stringify(cfg), "utf8");
    };

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-fwcfg-"));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        for (const key of ["ATABEY_SANDBOX_RUNTIME", "ATABEY_SANDBOX_REQUIRED", "ATABEY_SANDBOX_NETWORK",
            "ATABEY_SANDBOX_IMAGE", "ATABEY_SANDBOX_ENGINE", "MCP_AUTH_REQUIRED", "ATABEY_AUTH_REQUIRED"]) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
    });

    it("returns an empty config when the file is missing", () => {
        expect(loadFrameworkConfig(root)).toEqual({});
    });

    it("returns an empty config when the file is corrupt", () => {
        fs.mkdirSync(path.join(root, ".atabey"), { recursive: true });
        fs.writeFileSync(path.join(root, ".atabey", "config.json"), "{not json", "utf8");
        expect(loadFrameworkConfig(root)).toEqual({});
    });

    describe("sandbox", () => {
        it("uses the hardcoded fallback for a project without sections", () => {
            expect(resolveSandboxConfig(root)).toMatchObject({ runtime: "auto", required: false });
        });

        it("takes explicit config over any fallback", () => {
            writeConfig({ sandbox: { runtime: "seatbelt", required: true, network: "none" } });
            expect(resolveSandboxConfig(root)).toMatchObject({ runtime: "seatbelt", required: true, network: "none" });
        });

        it("honours a legacy profile only when the section is absent", () => {
            writeConfig({ profile: "enterprise" });
            expect(resolveSandboxConfig(root).required).toBe(true);

            writeConfig({ profile: "enterprise", sandbox: { required: false } });
            expect(resolveSandboxConfig(root).required).toBe(false);
        });

        it("ignores an unknown profile instead of throwing", () => {
            writeConfig({ profile: "platinum" });
            expect(resolveSandboxConfig(root).runtime).toBe("auto");
        });

        it("applies config to env but never overrides an existing variable", () => {
            writeConfig({ sandbox: { runtime: "seatbelt", required: true, network: "none" } });
            delete process.env.ATABEY_SANDBOX_RUNTIME;
            delete process.env.ATABEY_SANDBOX_REQUIRED;
            applySandboxEnvFromConfig(root);
            expect(process.env.ATABEY_SANDBOX_RUNTIME).toBe("seatbelt");
            expect(process.env.ATABEY_SANDBOX_REQUIRED).toBe("true");

            process.env.ATABEY_SANDBOX_RUNTIME = "none";
            applySandboxEnvFromConfig(root);
            expect(process.env.ATABEY_SANDBOX_RUNTIME).toBe("none");
        });

        it("does not set ATABEY_SANDBOX_REQUIRED when config does not require it", () => {
            writeConfig({ sandbox: { required: false } });
            delete process.env.ATABEY_SANDBOX_REQUIRED;
            applySandboxEnvFromConfig(root);
            expect(process.env.ATABEY_SANDBOX_REQUIRED).toBeUndefined();
        });
    });

    describe("auth", () => {
        it("defaults to not required", () => {
            expect(resolveAuthConfig(root)).toEqual({ required: false });
        });

        it("honours explicit config", () => {
            writeConfig({ auth: { required: true } });
            expect(resolveAuthConfig(root)).toEqual({ required: true });
        });

        it("applies required auth to env without clobbering env", () => {
            writeConfig({ auth: { required: true } });
            delete process.env.MCP_AUTH_REQUIRED;
            delete process.env.ATABEY_AUTH_REQUIRED;
            applyAuthEnvFromConfig(root);
            expect(process.env.MCP_AUTH_REQUIRED).toBe("true");

            process.env.MCP_AUTH_REQUIRED = "false";
            applyAuthEnvFromConfig(root);
            expect(process.env.MCP_AUTH_REQUIRED).toBe("false");
        });

        it("leaves env untouched when auth is not required", () => {
            writeConfig({ auth: { required: false } });
            delete process.env.MCP_AUTH_REQUIRED;
            applyAuthEnvFromConfig(root);
            expect(process.env.MCP_AUTH_REQUIRED).toBeUndefined();
        });
    });

    describe("compliance", () => {
        it("enables the data-protection controls by default", () => {
            expect(resolveComplianceConfig(root)).toMatchObject({
                retentionEnabled: true,
                consentLogging: true,
                piiMasking: true,
            });
        });

        it("takes explicit config over defaults", () => {
            writeConfig({ compliance: { piiMasking: false, dataProcessingBasis: "contract" } });
            const cfg = resolveComplianceConfig(root);
            expect(cfg.piiMasking).toBe(false);
            expect(cfg.dataProcessingBasis).toBe("contract");
            expect(cfg.retentionEnabled).toBe(true);
        });
    });
});
