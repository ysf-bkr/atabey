/**
 * Agent Identity — cryptographically signed agent tokens.
 *
 * Problem: `ATABEY_ACTIVE_AGENT` is a plain env var, so any tool/subprocess can
 * impersonate `@manager` or `@security`. When `ATABEY_AGENT_SECRET` is set,
 * Atabey accepts an HMAC-signed `ATABEY_AGENT_TOKEN` and verifies it
 * (fail-closed on tampering/expiry). Set `ATABEY_AGENT_IDENTITY_REQUIRED=true`
 * to refuse plain-env identity entirely.
 *
 * Token format: `${agent}.${issuedAt}.${expiresAt}.${hmacSha256Base64url}`
 */

import crypto from "crypto";
import { resolveAuditChainKey } from "../observability/audit-chain.js";

export interface AgentIdentity {
    agent: string;
    issuedAt: number;
    expiresAt: number;
}

export interface AgentTokenResult {
    valid: boolean;
    agent?: string;
    reason?: string;
}

function resolveKey(explicit?: string | Buffer): Buffer | null {
    if (explicit) {
        return Buffer.isBuffer(explicit) ? explicit : crypto.createHash("sha256").update(explicit, "utf8").digest();
    }
    const envSecret = process.env.ATABEY_AGENT_SECRET;
    if (envSecret && envSecret.trim()) {
        return crypto.createHash("sha256").update(envSecret.trim(), "utf8").digest();
    }
    return resolveAuditChainKey();
}

function timingSafeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

/** True when agent-token verification is mandatory (plain env rejected). */
export function isAgentIdentityEnforced(): boolean {
    return process.env.ATABEY_AGENT_IDENTITY_REQUIRED === "true";
}

/** Sign an agent identity into a compact token. */
export function signAgentToken(agent: string, options: { ttlMs?: number; key?: string | Buffer } = {}): string {
    const key = resolveKey(options.key);
    if (!key) {
        throw new Error("[AGENT_IDENTITY] No signing key. Set ATABEY_AGENT_SECRET.");
    }
    const name = agent.replace(/^@/, "");
    const issuedAt = Date.now();
    const expiresAt = issuedAt + (options.ttlMs ?? 60 * 60 * 1000);
    const payload = `${name}.${issuedAt}.${expiresAt}`;
    const sig = crypto.createHmac("sha256", key).update(payload).digest("base64url");
    return `${payload}.${sig}`;
}

/** Verify an agent token (signature + expiry). */
export function verifyAgentToken(token: string, options: { key?: string | Buffer } = {}): AgentTokenResult {
    const key = resolveKey(options.key);
    if (!key) return { valid: false, reason: "No signing key configured." };
    if (!token || typeof token !== "string") return { valid: false, reason: "Empty token." };

    const parts = token.split(".");
    if (parts.length !== 4) return { valid: false, reason: "Malformed token." };
    const [name, issuedAt, expiresAt, sig] = parts;
    const payload = `${name}.${issuedAt}.${expiresAt}`;
    const expected = crypto.createHmac("sha256", key).update(payload).digest("base64url");
    if (!timingSafeEqual(sig, expected)) return { valid: false, reason: "Signature mismatch." };

    const exp = Number(expiresAt);
    if (!Number.isFinite(exp)) return { valid: false, reason: "Invalid expiry." };
    if (Date.now() > exp) return { valid: false, reason: "Token expired." };

    return { valid: true, agent: `@${name}` };
}

/** Decode a token's identity without verification (for diagnostics only). */
export function decodeAgentToken(token: string): AgentIdentity | null {
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    return { agent: `@${parts[0]}`, issuedAt: Number(parts[1]), expiresAt: Number(parts[2]) };
}
