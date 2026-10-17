import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyJwt } from "../src/oidc.js";

function hmacJwt(payload: Record<string, unknown>, secret: string, header: Record<string, unknown> = { alg: "HS256", typ: "JWT" }): string {
    const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const input = `${enc(header)}.${enc(payload)}`;
    const sig = crypto.createHmac("sha256", secret).update(input).digest("base64url");
    return `${input}.${sig}`;
}

const SECRET = "unit-test-oidc-secret";
const now = Math.floor(Date.now() / 1000);

describe("OIDC JWT verification (HS256)", () => {
    it("accepts a valid token and enforces iss/aud", () => {
        const token = hmacJwt({ sub: "u1", iss: "https://issuer", aud: "atabey", exp: now + 60 }, SECRET);
        const res = verifyJwt(token, { secret: SECRET, issuer: "https://issuer", audience: "atabey" });
        expect(res.valid).toBe(true);
        expect(res.payload?.sub).toBe("u1");
    });

    it("rejects a tampered payload", () => {
        const token = hmacJwt({ sub: "u1", exp: now + 60 }, SECRET);
        const parts = token.split(".");
        parts[1] = Buffer.from(JSON.stringify({ sub: "admin", exp: now + 60 })).toString("base64url");
        const res = verifyJwt(parts.join("."), { secret: SECRET });
        expect(res.valid).toBe(false);
        expect(res.reason).toMatch(/signature/i);
    });

    it("rejects an expired token", () => {
        const token = hmacJwt({ sub: "u1", exp: now - 10 }, SECRET);
        expect(verifyJwt(token, { secret: SECRET }).valid).toBe(false);
    });

    it("rejects a wrong issuer/audience", () => {
        const token = hmacJwt({ sub: "u1", iss: "https://evil", aud: "other", exp: now + 60 }, SECRET);
        expect(verifyJwt(token, { secret: SECRET, issuer: "https://issuer" }).valid).toBe(false);
        expect(verifyJwt(token, { secret: SECRET, audience: "atabey" }).valid).toBe(false);
    });

    it("rejects alg=none", () => {
        const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
        const token = `${enc({ alg: "none" })}.${enc({ sub: "u1" })}.`;
        expect(verifyJwt(token, { secret: SECRET }).valid).toBe(false);
    });
});
