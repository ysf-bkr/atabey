/**
 * Secret Management & Leak Guard (Phase 1.5)
 *
 * Provides:
 *   1. Encrypted local secret vault (.atabey/secrets.vault.json) using AES-256-GCM
 *      with per-secret random salt (HKDF-SHA256) and 96-bit IV.
 *   2. Subprocess environment scrubber (strips sensitive keys before spawning child processes).
 *   3. Secret leak scanner (detects API keys, cloud credentials, private keys, and vault values).
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "./storage.js";

export interface VaultEntry {
    /** Base64-encoded 16-byte HKDF salt */
    salt: string;
    /** Base64-encoded 12-byte GCM initialization vector */
    iv: string;
    /** Base64-encoded 16-byte GCM authentication tag */
    tag: string;
    /** Base64-encoded ciphertext */
    ciphertext: string;
    /** ISO-8601 creation timestamp */
    createdAt: string;
    /** ISO-8601 last update timestamp */
    updatedAt: string;
    /** Optional non-sensitive description */
    description?: string;
}

export interface VaultFile {
    version: 1;
    entries: Record<string, VaultEntry>;
}

export interface SecretMetadata {
    name: string;
    createdAt: string;
    updatedAt: string;
    description?: string;
}

export interface SecretFinding {
    ruleId: string;
    description: string;
    matchPreview: string;
    index: number;
}

/** Env var names or patterns that must never leak into untrusted subprocesses. */
const SENSITIVE_ENV_PATTERNS: RegExp[] = [
    /_KEY$/i,
    /_KEYS$/i,
    /_SECRET/i,
    /_TOKEN$/i,
    /_PASSWORD$/i,
    /_PASSWD$/i,
    /(^|_)PWD$/i,
    /^PGPASSWORD$/i,
    /_CREDENTIAL/i,
    /_PRIVATE/i,
    /_PASSPHRASE$/i,
    /ACCESS_KEY/i,
    /_APIKEY$/i,
    /_DSN$/i,
    /(^|_)AUTH$/i,
    /_SALT$/i,
    /(^|_)SECRETKEY/i,
    /^ATABEY_AUDIT_HMAC_KEY$/i,
    /^ATABEY_MASTER_KEY$/i,
    /^MCP_AUTH_TOKEN$/i,
    /^MCP_AUTH_USERS$/i,
    /^DATABASE_URL$/i,
    /^REDIS_URL$/i,
    /^OPENAI_API_KEY$/i,
    /^ANTHROPIC_API_KEY$/i,
    /^GEMINI_API_KEY$/i,
    /^GOOGLE_API_KEY$/i,
    /^AWS_SECRET_ACCESS_KEY$/i,
    /^AWS_SESSION_TOKEN$/i,
    /^GITHUB_TOKEN$/i,
    /^GH_TOKEN$/i,
    /^GITLAB_TOKEN$/i,
    /^NPM_TOKEN$/i,
    /^SLACK_BOT_TOKEN$/i,
    /^STRIPE_SECRET_KEY$/i,
];

interface SecretLeakPattern {
    id: string;
    description: string;
    regex: RegExp;
}

const SECRET_LEAK_PATTERNS: SecretLeakPattern[] = [
    {
        id: "aws-access-key",
        description: "AWS Access Key ID",
        regex: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    },
    {
        id: "github-pat",
        description: "GitHub Personal Access Token",
        regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b|\bgithub_pat_[A-Za-z0-9_]{80,255}\b/g,
    },
    {
        id: "openai-anthropic-key",
        description: "OpenAI / Anthropic API Key",
        regex: /\bsk-(?:proj-|ant-api\d{2}-|live-|test-)?[A-Za-z0-9_-]{20,200}\b/g,
    },
    {
        id: "google-api-key",
        description: "Google Cloud / Gemini API Key",
        regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    },
    {
        id: "slack-token",
        description: "Slack API Token",
        regex: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*\b/g,
    },
    {
        id: "private-key-pem",
        description: "PEM Private Key Block",
        regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g,
    },
    {
        id: "stripe-secret",
        description: "Stripe Live/Test Secret Key",
        regex: /\b(?:sk|rk)_(?:live|test)_[0-9a-zA-Z]{24,99}\b/g,
    },
];

function deriveSubkey(masterKey: Buffer, salt: Buffer): Buffer {
    return Buffer.from(
        crypto.hkdfSync("sha256", masterKey, salt, Buffer.from("atabey-vault-v1", "utf8"), 32),
    );
}

function redactPreview(match: string): string {
    if (match.length <= 8) return "***";
    return `${match.slice(0, 4)}...${match.slice(-3)}`;
}

export class SecretManager {
    private static resolveVaultDir(customDir?: string): string {
        if (customDir) return customDir;
        const envDir = process.env.ATABEY_TEST_DIR || process.env.ATABEY_FRAMEWORK_DIR;
        if (envDir && envDir.trim()) return envDir.trim();
        return resolveFrameworkDir();
    }

    private static resolveMasterKey(vaultDir: string): Buffer {
        const envKey = process.env.ATABEY_MASTER_KEY?.trim();
        if (envKey) {
            return crypto.createHash("sha256").update(envKey, "utf8").digest();
        }
        const keyPath = path.join(vaultDir, "master.key");
        if (fs.existsSync(keyPath)) {
            const raw = fs.readFileSync(keyPath);
            if (raw.length === 32) return raw;
            return crypto.createHash("sha256").update(raw).digest();
        }
        fs.mkdirSync(vaultDir, { recursive: true });
        const generated = crypto.randomBytes(32);
        fs.writeFileSync(keyPath, generated, { mode: 0o600 });
        return generated;
    }

    private static vaultFilePath(vaultDir: string): string {
        return path.join(vaultDir, "secrets.vault.json");
    }

    private static readVault(vaultDir: string): VaultFile {
        const filePath = this.vaultFilePath(vaultDir);
        if (!fs.existsSync(filePath)) {
            return { version: 1, entries: {} };
        }
        const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as VaultFile;
        if (!raw || raw.version !== 1 || typeof raw.entries !== "object" || raw.entries === null) {
            throw new Error("Invalid or unsupported secrets.vault.json format.");
        }
        return raw;
    }

    private static writeVault(vaultDir: string, vault: VaultFile): void {
        fs.mkdirSync(vaultDir, { recursive: true });
        const filePath = this.vaultFilePath(vaultDir);
        const tmpPath = `${filePath}.tmp.${process.pid}`;
        fs.writeFileSync(tmpPath, JSON.stringify(vault, null, 2), { mode: 0o600 });
        fs.renameSync(tmpPath, filePath);
    }

    /**
     * Encrypt and store a secret in the local AES-256-GCM vault.
     */
    public static setSecret(
        name: string,
        value: string,
        options: { description?: string; vaultDir?: string } = {},
    ): void {
        const keyName = name.trim();
        if (!keyName || !/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/.test(keyName)) {
            throw new Error(`Invalid secret name "${name}". Use alphanumeric, '_', '.', or '-' characters.`);
        }
        const vaultDir = this.resolveVaultDir(options.vaultDir);
        const masterKey = this.resolveMasterKey(vaultDir);
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const subkey = deriveSubkey(masterKey, salt);

        const cipher = crypto.createCipheriv("aes-256-gcm", subkey, iv);
        cipher.setAAD(Buffer.from(keyName, "utf8"));
        const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
        const tag = cipher.getAuthTag();

        const vault = this.readVault(vaultDir);
        const now = new Date().toISOString();
        const existing = vault.entries[keyName];

        vault.entries[keyName] = {
            salt: salt.toString("base64"),
            iv: iv.toString("base64"),
            tag: tag.toString("base64"),
            ciphertext: encrypted.toString("base64"),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            description: options.description ?? existing?.description,
        };

        this.writeVault(vaultDir, vault);
    }

    /**
     * Retrieve and decrypt a secret by name.
     * Checks process.env[name] fallback only when allowEnvFallback is true.
     */
    public static getSecret(
        name: string,
        options: { vaultDir?: string; allowEnvFallback?: boolean } = {},
    ): string | null {
        const keyName = name.trim();
        const vaultDir = this.resolveVaultDir(options.vaultDir);
        const vault = this.readVault(vaultDir);
        const entry = vault.entries[keyName];
        if (!entry) {
            if (options.allowEnvFallback && process.env[keyName] !== undefined) {
                return process.env[keyName] ?? null;
            }
            return null;
        }

        const masterKey = this.resolveMasterKey(vaultDir);
        const salt = Buffer.from(entry.salt, "base64");
        const iv = Buffer.from(entry.iv, "base64");
        const tag = Buffer.from(entry.tag, "base64");
        const ciphertext = Buffer.from(entry.ciphertext, "base64");
        const subkey = deriveSubkey(masterKey, salt);

        const decipher = crypto.createDecipheriv("aes-256-gcm", subkey, iv);
        decipher.setAAD(Buffer.from(keyName, "utf8"));
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString("utf8");
    }

    /**
     * Delete a secret from the vault.
     */
    public static deleteSecret(name: string, options: { vaultDir?: string } = {}): boolean {
        const keyName = name.trim();
        const vaultDir = this.resolveVaultDir(options.vaultDir);
        const vault = this.readVault(vaultDir);
        if (!(keyName in vault.entries)) return false;
        delete vault.entries[keyName];
        this.writeVault(vaultDir, vault);
        return true;
    }

    /**
     * List stored secret metadata without exposing plaintext values.
     */
    public static listSecrets(options: { vaultDir?: string } = {}): SecretMetadata[] {
        const vaultDir = this.resolveVaultDir(options.vaultDir);
        const vault = this.readVault(vaultDir);
        return Object.entries(vault.entries).map(([name, entry]) => ({
            name,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            description: entry.description,
        }));
    }

    /**
     * Re-encrypt all vault entries under a new 32-byte master key.
     *
     * Safe ordering: decrypt everything first, build the new vault in memory,
     * then atomically swap. The previous key is kept as `master.key.bak` for
     * the duration of the swap and restored on failure, so a mid-rotation error
     * cannot make the vault permanently undecryptable.
     */
    public static rotateMasterKey(newKeyMaterial: string | Buffer, options: { vaultDir?: string } = {}): number {
        const vaultDir = this.resolveVaultDir(options.vaultDir);
        if (process.env.ATABEY_MASTER_KEY?.trim()) {
            throw new Error(
                "[VAULT] ATABEY_MASTER_KEY is authoritative; file-based rotation is disabled while it is set. " +
                "Rotate by changing ATABEY_MASTER_KEY and re-running `atabey secrets set` for each secret.",
            );
        }

        const vault = this.readVault(vaultDir);
        const names = Object.keys(vault.entries);
        if (names.length === 0) return 0;

        // 1. Decrypt everything with the CURRENT key (no writes yet).
        const decrypted = names.map((name) => {
            const value = this.getSecret(name, { vaultDir });
            if (value === null) {
                throw new Error(`Failed to decrypt secret "${name}" during key rotation.`);
            }
            return {
                name,
                value,
                description: vault.entries[name].description,
                createdAt: vault.entries[name].createdAt,
            };
        });

        const newMasterKey =
            typeof newKeyMaterial === "string"
                ? crypto.createHash("sha256").update(newKeyMaterial, "utf8").digest()
                : newKeyMaterial.length === 32
                  ? Buffer.from(newKeyMaterial)
                  : crypto.createHash("sha256").update(newKeyMaterial).digest();

        // 2. Build the new vault in memory, encrypted with the new key.
        const newEntries: Record<string, VaultEntry> = {};
        const now = new Date().toISOString();
        for (const item of decrypted) {
            const salt = crypto.randomBytes(16);
            const iv = crypto.randomBytes(12);
            const subkey = deriveSubkey(newMasterKey, salt);
            const cipher = crypto.createCipheriv("aes-256-gcm", subkey, iv);
            cipher.setAAD(Buffer.from(item.name, "utf8"));
            const encrypted = Buffer.concat([cipher.update(item.value, "utf8"), cipher.final()]);
            newEntries[item.name] = {
                salt: salt.toString("base64"),
                iv: iv.toString("base64"),
                tag: cipher.getAuthTag().toString("base64"),
                ciphertext: encrypted.toString("base64"),
                createdAt: item.createdAt,
                updatedAt: now,
                description: item.description,
            };
        }

        // 3. Atomically swap key + vault with rollback protection.
        fs.mkdirSync(vaultDir, { recursive: true });
        const keyPath = path.join(vaultDir, "master.key");
        const backupPath = `${keyPath}.bak`;
        const hadKey = fs.existsSync(keyPath);
        const oldKey = hadKey ? fs.readFileSync(keyPath) : null;

        try {
            if (oldKey) fs.writeFileSync(backupPath, oldKey, { mode: 0o600 });
            fs.writeFileSync(keyPath, newMasterKey, { mode: 0o600 });
            this.writeVault(vaultDir, { version: 1, entries: newEntries });
            if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        } catch (err) {
            // Restore the previous key so the (unchanged) old vault stays readable.
            try {
                if (oldKey) fs.writeFileSync(keyPath, oldKey, { mode: 0o600 });
                else if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
                if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
            } catch {
                /* best-effort rollback */
            }
            throw err;
        }

        return decrypted.length;
    }
}

/**
 * Scrub sensitive credentials from an environment object before passing to a child process.
 */
export function scrubEnvForSubprocess(
    env: NodeJS.ProcessEnv = process.env,
    extraAllowedKeys: string[] = [],
): NodeJS.ProcessEnv {
    const allowed = new Set(extraAllowedKeys.map((k) => k.toUpperCase()));
    const clean: NodeJS.ProcessEnv = {};

    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) continue;
        if (allowed.has(key.toUpperCase())) {
            clean[key] = value;
            continue;
        }
        const isSensitive = SENSITIVE_ENV_PATTERNS.some((re) => re.test(key));
        if (!isSensitive) {
            clean[key] = value;
        }
    }
    return clean;
}

/**
 * Scan arbitrary text (command output, file content, tool arguments) for leaked secrets.
 */
export function scanForSecrets(text: string): SecretFinding[] {
    if (!text) return [];
    const findings: SecretFinding[] = [];

    for (const pattern of SECRET_LEAK_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.regex.exec(text)) !== null) {
            findings.push({
                ruleId: pattern.id,
                description: pattern.description,
                matchPreview: redactPreview(match[0]),
                index: match.index,
            });
        }
    }
    return findings;
}

/**
 * Redact leaked secrets from text before it is returned to an AI/LLM.
 * Complements PII masking with cloud-credential/private-key patterns.
 */
export function redactSecrets(text: string): string {
    if (!text) return text;
    let out = text;
    for (const pattern of SECRET_LEAK_PATTERNS) {
        const flags = pattern.regex.flags.includes("g") ? pattern.regex.flags : `${pattern.regex.flags}g`;
        out = out.replace(new RegExp(pattern.regex.source, flags), `[REDACTED:${pattern.id}]`);
    }
    return out;
}
