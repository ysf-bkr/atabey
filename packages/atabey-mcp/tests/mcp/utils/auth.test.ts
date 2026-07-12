import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("Auth (Phase 2.1)", () => {
    beforeEach(() => {
        delete process.env.MCP_AUTH_TOKEN;
        delete process.env.MCP_AUTH_USERS;
        delete process.env.MCP_AUTH_REQUIRED;
        delete process.env.ATABEY_AUTH_REQUIRED;
        delete process.env.ATABEY_OIDC_ISSUER;
        delete process.env.ATABEY_OIDC_JWKS_URL;
        delete process.env.ATABEY_OIDC_AUDIENCE;
    });

    afterEach(async () => {
        const { resetAuthForTests } = await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        delete process.env.MCP_AUTH_TOKEN;
        delete process.env.MCP_AUTH_USERS;
        delete process.env.MCP_AUTH_REQUIRED;
    });

    it("allows anonymous when auth not required and no tokens", async () => {
        const { resetAuthForTests, initAuth, authenticate, getAuthStatus } =
            await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        initAuth();
        const r = authenticate({ headers: {} });
        expect(r.authenticated).toBe(true);
        expect(r.user).toBe("anonymous");
        expect(getAuthStatus().openAccess).toBe(true);
    });

    it("denies when auth required without credentials", async () => {
        process.env.MCP_AUTH_REQUIRED = "true";
        const { resetAuthForTests, initAuth, authenticate, requireAuthForPath } =
            await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        initAuth();
        const r = authenticate({ headers: {} });
        expect(r.authenticated).toBe(false);

        const pathAuth = requireAuthForPath("/api/agents", { headers: {} });
        expect(pathAuth.allowed).toBe(false);
        if (!pathAuth.allowed) expect(pathAuth.status).toBe(401);
    });

    it("accepts master bearer token", async () => {
        process.env.MCP_AUTH_TOKEN = "super-secret-token-12345";
        process.env.MCP_AUTH_REQUIRED = "true";
        const { resetAuthForTests, initAuth, authenticate } =
            await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        initAuth();
        const ok = authenticate({
            headers: { authorization: "Bearer super-secret-token-12345" },
        });
        expect(ok.authenticated).toBe(true);
        expect(ok.user).toBe("admin");
        expect(ok.method).toBe("master");

        const bad = authenticate({
            headers: { authorization: "Bearer wrong" },
        });
        expect(bad.authenticated).toBe(false);
    });

    it("accepts user tokens from MCP_AUTH_USERS", async () => {
        process.env.MCP_AUTH_USERS = "alice:key-alice,bob:key-bob";
        process.env.MCP_AUTH_REQUIRED = "true";
        const { resetAuthForTests, initAuth, authenticateToken } =
            await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        initAuth();
        expect(authenticateToken("key-alice").user).toBe("alice");
        expect(authenticateToken("key-bob").user).toBe("bob");
        expect(authenticateToken("nope").authenticated).toBe(false);
    });

    it("keeps /api/health public even when required", async () => {
        process.env.MCP_AUTH_REQUIRED = "true";
        process.env.MCP_AUTH_TOKEN = "tok";
        const { resetAuthForTests, initAuth, requireAuthForPath } =
            await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        initAuth();
        const health = requireAuthForPath("/api/health", { headers: {} });
        expect(health.allowed).toBe(true);
    });

    it("protects /mcp/sse when credentials configured", async () => {
        process.env.MCP_AUTH_TOKEN = "tok";
        // credentials configured → enabled even if not required
        const { resetAuthForTests, initAuth, requireAuthForPath } =
            await import("../../../src/mcp/utils/auth.js");
        resetAuthForTests();
        initAuth();
        const denied = requireAuthForPath("/mcp/sse", { headers: {} });
        expect(denied.allowed).toBe(false);
        const ok = requireAuthForPath("/mcp/sse", {
            headers: { authorization: "Bearer tok" },
        });
        expect(ok.allowed).toBe(true);
        if (ok.allowed) expect(ok.user).toBe("admin");
    });
});
