import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretManager, scanForSecrets, scrubEnvForSubprocess } from "../src/modules/security/secrets.js";

describe("SecretManager & Leak Guard", () => {
    let vaultDir: string;

    beforeEach(() => {
        vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-vault-test-"));
        delete process.env.ATABEY_MASTER_KEY;
    });

    afterEach(() => {
        delete process.env.ATABEY_MASTER_KEY;
        fs.rmSync(vaultDir, { recursive: true, force: true });
    });

    it("encrypts, retrieves, lists, and deletes secrets using AES-256-GCM", () => {
        SecretManager.setSecret("DB_PASSWORD", "super-secret-123!", {
            description: "Primary DB password",
            vaultDir,
        });

        // Raw vault file must not contain plaintext
        const rawVault = fs.readFileSync(path.join(vaultDir, "secrets.vault.json"), "utf8");
        expect(rawVault).not.toContain("super-secret-123!");

        expect(SecretManager.getSecret("DB_PASSWORD", { vaultDir })).toBe("super-secret-123!");
        expect(SecretManager.getSecret("UNKNOWN_KEY", { vaultDir })).toBeNull();

        const list = SecretManager.listSecrets({ vaultDir });
        expect(list).toHaveLength(1);
        expect(list[0].name).toBe("DB_PASSWORD");
        expect(list[0].description).toBe("Primary DB password");

        expect(SecretManager.deleteSecret("DB_PASSWORD", { vaultDir })).toBe(true);
        expect(SecretManager.getSecret("DB_PASSWORD", { vaultDir })).toBeNull();
    });

    it("rotates master key without losing encrypted values", () => {
        SecretManager.setSecret("API_KEY_A", "val-alpha", { vaultDir });
        SecretManager.setSecret("API_KEY_B", "val-beta", { vaultDir });

        const rotated = SecretManager.rotateMasterKey("new-master-passphrase-2026", { vaultDir });
        expect(rotated).toBe(2);
        expect(SecretManager.getSecret("API_KEY_A", { vaultDir })).toBe("val-alpha");
        expect(SecretManager.getSecret("API_KEY_B", { vaultDir })).toBe("val-beta");
    });

    it("scrubs sensitive env vars for subprocesses", () => {
        const scrubbed = scrubEnvForSubprocess(
            {
                PATH: "/usr/local/bin",
                NODE_ENV: "production",
                OPENAI_API_KEY: "sk-proj-12345",
                CUSTOM_SERVICE_SECRET: "topsecret",
                DB_PASSWORD: "pw",
                ALLOWED_TOKEN: "keep-me",
            },
            ["ALLOWED_TOKEN"],
        );
        expect(scrubbed.PATH).toBe("/usr/local/bin");
        expect(scrubbed.NODE_ENV).toBe("production");
        expect(scrubbed.ALLOWED_TOKEN).toBe("keep-me");
        expect(scrubbed.OPENAI_API_KEY).toBeUndefined();
        expect(scrubbed.CUSTOM_SERVICE_SECRET).toBeUndefined();
        expect(scrubbed.DB_PASSWORD).toBeUndefined();
    });

    it("detects leaked credentials in text via scanForSecrets", () => {
        const sample = [
            "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE",
            "const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';",
            "-----BEGIN RSA PRIVATE KEY-----",
        ].join("\n");

        const findings = scanForSecrets(sample);
        const ids = findings.map((f) => f.ruleId);
        expect(ids).toContain("aws-access-key");
        expect(ids).toContain("openai-anthropic-key");
        expect(ids).toContain("private-key-pem");
    });
});
