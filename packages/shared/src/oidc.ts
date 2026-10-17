/**
 * OIDC / JWT verification for the dashboard & MCP HTTP auth (no SDK dependency).
 *
 * Supports:
 *   - HS256 (shared secret) via ATABEY_OIDC_HS_SECRET
 *   - RS256 / ES256 (JWKS) via ATABEY_OIDC_JWKS_URL
 *   - Claims: exp, nbf, iss (ATABEY_OIDC_ISSUER), aud (ATABEY_OIDC_AUDIENCE)
 *
 * `verifyJwt` is pure; `verifyOidcToken` reads configuration from the env and
 * is used by the auth layer when a JWT-shaped bearer token is presented.
 */

import crypto from "crypto";

export interface JwtPayload {
    sub?: string;
    iss?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    email?: string;
    name?: string;
    role?: string;
    [key: string]: unknown;
}

export interface JwtVerifyResult {
    valid: boolean;
    payload?: JwtPayload;
    reason?: string;
}

interface Jwk {
    kty?: string;
    kid?: string;
    alg?: string;
    use?: string;
    n?: string;
    e?: string;
    crv?: string;
    x?: string;
    y?: string;
    [key: string]: unknown;
}

let jwksCache: { fetchedAt: number; keys: Jwk[] } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000;

function b64urlDecode(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function timingSafeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

function checkClaims(payload: JwtPayload, options: { issuer?: string; audience?: string; now?: number }): string | null {
    const now = Math.floor((options.now ?? Date.now()) / 1000);
    if (typeof payload.exp === "number" && payload.exp < now) return "Token expired (exp).";
    if (typeof payload.nbf === "number" && payload.nbf > now) return "Token not yet valid (nbf).";
    if (options.issuer && payload.iss && payload.iss !== options.issuer) return `Issuer mismatch (iss=${payload.iss}).`;
    if (options.audience) {
        const aud = payload.aud;
        const ok = Array.isArray(aud) ? aud.includes(options.audience) : aud === options.audience;
        if (!ok) return "Audience mismatch (aud).";
    }
    return null;
}

/**
 * Verify a JWT. Provide either `secret` (HS256) or `jwks` (RS256/ES256).
 */
export function verifyJwt(
    token: string,
    options: { secret?: string; jwks?: Jwk[]; issuer?: string; audience?: string; now?: number } = {},
): JwtVerifyResult {
    if (!token || token.split(".").length !== 3) return { valid: false, reason: "Not a JWT." };
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    let header: { alg?: string; kid?: string };
    let payload: JwtPayload;
    try {
        header = JSON.parse(b64urlDecode(headerB64).toString("utf8"));
        payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
    } catch {
        return { valid: false, reason: "Malformed JWT." };
    }

    const signingInput = `${headerB64}.${payloadB64}`;
    const signature = b64urlDecode(signatureB64);

    const alg = header.alg || "";
    if (alg === "HS256" || alg === "HS384" || alg === "HS512") {
        if (!options.secret) return { valid: false, reason: "HS256 requires a secret." };
        const hash = alg.replace("HS", "sha");
        const expected = crypto.createHmac(hash, options.secret).update(signingInput).digest();
        if (!timingSafeEqual(signature.toString("base64url"), expected.toString("base64url"))) {
            return { valid: false, reason: "Signature mismatch." };
        }
    } else if (alg === "RS256" || alg === "RS384" || alg === "RS512" || alg === "ES256" || alg === "ES384" || alg === "ES512") {
        if (!options.jwks || options.jwks.length === 0) return { valid: false, reason: "No JWKS provided." };
        const jwk = options.jwks.find((k) => !header.kid || k.kid === header.kid) || options.jwks[0];
        try {
            const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" } as unknown as Parameters<typeof crypto.createPublicKey>[0]);
            const hash = alg.replace(/^(RS|ES)/, "sha");
            const ok = crypto.verify(hash, Buffer.from(signingInput), publicKey, signature);
            if (!ok) return { valid: false, reason: "Signature mismatch." };
        } catch (e) {
            return { valid: false, reason: `Key/verify error: ${(e as Error).message}` };
        }
    } else {
        return { valid: false, reason: `Unsupported alg: ${alg || "none"}` };
    }

    const claimError = checkClaims(payload, options);
    if (claimError) return { valid: false, reason: claimError };

    return { valid: true, payload };
}

export function isOidcConfigured(): boolean {
    return Boolean(
        process.env.ATABEY_OIDC_JWKS_URL?.trim() ||
        process.env.ATABEY_OIDC_HS_SECRET?.trim(),
    );
}

async function fetchJwks(url: string): Promise<Jwk[]> {
    if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = Array.isArray(body.keys) ? body.keys : [];
    jwksCache = { fetchedAt: Date.now(), keys };
    return keys;
}

/** Synchronous access to the cached JWKS (populated by primeJwks at startup). */
export function getCachedJwks(): Jwk[] | null {
    return jwksCache?.keys ?? null;
}

/** Fetch and cache JWKS from the configured URL (call once at startup). */
export async function primeJwks(): Promise<void> {
    const jwksUrl = process.env.ATABEY_OIDC_JWKS_URL?.trim();
    if (!jwksUrl) return;
    try {
        await fetchJwks(jwksUrl);
    } catch {
        /* collector unreachable; RS256 tokens will fail closed until reachable */
    }
}

/** Verify a bearer token against the configured OIDC provider. */
export async function verifyOidcToken(token: string): Promise<JwtVerifyResult> {
    const issuer = process.env.ATABEY_OIDC_ISSUER?.trim();
    const audience = process.env.ATABEY_OIDC_AUDIENCE?.trim();
    const hsSecret = process.env.ATABEY_OIDC_HS_SECRET?.trim();
    const jwksUrl = process.env.ATABEY_OIDC_JWKS_URL?.trim();

    if (hsSecret) {
        return verifyJwt(token, { secret: hsSecret, issuer, audience });
    }
    if (jwksUrl) {
        try {
            const jwks = await fetchJwks(jwksUrl);
            return verifyJwt(token, { jwks, issuer, audience });
        } catch (e) {
            return { valid: false, reason: (e as Error).message };
        }
    }
    return { valid: false, reason: "OIDC is not configured." };
}

/** Test helper — clears the JWKS cache. */
export function clearJwksCache(): void {
    jwksCache = null;
}
