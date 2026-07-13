import { execSync } from "child_process";
import crypto from "crypto";
import { AtabeyStorage } from "../../shared/storage.js";

/**
 * ─── MCP AUTHENTICATION (Phase 2.1) ──────────────────────────────
 *
 * API key authentication for unified HTTP dashboard / MCP SSE.
 *
 * Environment:
 *   MCP_AUTH_TOKEN      - Master admin API key
 *   MCP_AUTH_USERS      - user1:key1,user2:key2
 *   MCP_AUTH_REQUIRED   - true|false — fail closed when no valid token
 *                         (enterprise profile defaults this to true)
 *
 * Config (.atabey/config.json):
 *   "auth": { "required": true }
 *
 * OIDC (Phase 2 prep — config only; full JWT validation in 2.2+):
 *   ATABEY_OIDC_ISSUER, ATABEY_OIDC_AUDIENCE, ATABEY_OIDC_JWKS_URL
 *
 * If auth is NOT required and no tokens configured → open access (anonymous).
 * If auth IS required and no tokens/OIDC configured → deny all (fail closed).
 */

interface AuthUser {
    name: string;
    token: string;
}

export interface AuthResult {
    authenticated: boolean;
    user: string;
    reason?: string;
    method?: "none" | "master" | "user" | "db" | "anonymous" | "denied";
}

export interface AuthStatus {
    enabled: boolean;
    required: boolean;
    masterConfigured: boolean;
    userCount: number;
    dbUserCount: number;
    openAccess: boolean;
    oidcConfigured: boolean;
}

let authUsers: AuthUser[] = [];
let masterToken: string | null = null;
let authRequired = false;
let initialized = false;

/** Paths that never require a bearer token (health only by default). */
export const DEFAULT_PUBLIC_API_PATHS = new Set([
    "/api/health",
    "/mcp/health",
]);

function timingSafeTokenEqual(a: string, b: string): boolean {
    try {
        const ba = Buffer.from(a, "utf8");
        const bb = Buffer.from(b, "utf8");
        if (ba.length !== bb.length || ba.length === 0) {
            // Still do a compare to reduce timing signal on length
            const dummy = Buffer.alloc(ba.length || 1);
            crypto.timingSafeEqual(dummy, dummy);
            return false;
        }
        return crypto.timingSafeEqual(ba, bb);
    } catch {
        return false;
    }
}

function hasCredentialStore(): boolean {
    let dbUsers: boolean;
    try {
        dbUsers = AtabeyStorage.hasUsers();
    } catch {
        dbUsers = false;
    }
    return !!masterToken || authUsers.length > 0 || dbUsers;
}

/**
 * Initialize authentication from environment variables.
 * Safe to call multiple times (re-reads env).
 */
export function initAuth(): void {
    masterToken = process.env.MCP_AUTH_TOKEN?.trim() || null;
    authRequired =
        process.env.MCP_AUTH_REQUIRED === "true" ||
        process.env.MCP_AUTH_REQUIRED === "1" ||
        process.env.ATABEY_AUTH_REQUIRED === "true" ||
        process.env.ATABEY_AUTH_REQUIRED === "1";

    const usersStr = process.env.MCP_AUTH_USERS || "";
    if (usersStr) {
        authUsers = usersStr.split(",").map((pair) => {
            const idx = pair.indexOf(":");
            if (idx <= 0) return { name: "unknown", token: "" };
            return {
                name: pair.slice(0, idx).trim() || "unknown",
                token: pair.slice(idx + 1).trim() || "",
            };
        }).filter((u) => u.token);
    } else {
        authUsers = [];
    }

    if (masterToken) {
        process.stderr.write(`[AUTH] Master token configured (${masterToken.length} chars)\n`);
    }
    if (authUsers.length > 0) {
        process.stderr.write(
            `[AUTH] ${authUsers.length} user(s) configured: ${authUsers.map((u) => u.name).join(", ")}\n`,
        );
    }
    try {
        if (AtabeyStorage.hasUsers()) {
            const dbUsers = AtabeyStorage.getUsers();
            process.stderr.write(`[AUTH] Database authentication active (${dbUsers.length} users)\n`);
        }
    } catch {
        // storage not ready
    }

    const oidc = isOidcConfigured();
    if (oidc) {
        process.stderr.write(
            `[AUTH] OIDC config detected (issuer=${process.env.ATABEY_OIDC_ISSUER}) — JWT validation not yet enforced (Phase 2.2)\n`,
        );
    }

    if (authRequired) {
        process.stderr.write("[AUTH] REQUIRED mode ON — unauthenticated API/MCP HTTP access denied\n");
        if (!hasCredentialStore() && !oidc) {
            process.stderr.write(
                "[AUTH] WARNING: Auth required but no MCP_AUTH_TOKEN / MCP_AUTH_USERS / DB users configured. All requests will be denied.\n",
            );
        }
    } else if (!hasCredentialStore()) {
        process.stderr.write("[AUTH] No authentication configured — OPEN ACCESS (anonymous)\n");
        process.stderr.write(
            "[AUTH] Set MCP_AUTH_REQUIRED=true and MCP_AUTH_TOKEN=<key> for enterprise deployments\n",
        );
    }

    initialized = true;
}

export function isOidcConfigured(): boolean {
    return !!(
        process.env.ATABEY_OIDC_ISSUER &&
        (process.env.ATABEY_OIDC_JWKS_URL || process.env.ATABEY_OIDC_AUDIENCE)
    );
}

/**
 * Whether auth is mandatory (fail closed).
 */
export function isAuthRequired(): boolean {
    if (!initialized) initAuth();
    return authRequired;
}

/**
 * Whether any credential mechanism is configured.
 */
export function isAuthEnabled(): boolean {
    if (!initialized) initAuth();
    return hasCredentialStore() || isOidcConfigured();
}

/**
 * Authenticate a request using the Authorization header.
 */
export function authenticate(
    req: { headers: Record<string, string | string[] | undefined> },
): AuthResult {
    if (!initialized) initAuth();

    const credentials = hasCredentialStore();

    // Open access only when not required and no credentials
    if (!authRequired && !credentials) {
        return { authenticated: true, user: "anonymous", method: "anonymous" };
    }

    // Required but no credentials configured → fail closed
    if (authRequired && !credentials) {
        return {
            authenticated: false,
            user: "",
            method: "denied",
            reason: "Auth required but no tokens configured",
        };
    }

    const authHeader = req.headers["authorization"];
    const headerVal = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!headerVal) {
        return {
            authenticated: false,
            user: "",
            method: "denied",
            reason: "Missing Authorization header",
        };
    }

    const token = headerVal.startsWith("Bearer ") ? headerVal.slice(7).trim() : headerVal.trim();
    if (!token) {
        return { authenticated: false, user: "", method: "denied", reason: "Empty bearer token" };
    }

    return authenticateToken(token);
}

/**
 * Authenticate using a raw token string.
 */
export function authenticateToken(token: string): AuthResult {
    if (!initialized) initAuth();

    const credentials = hasCredentialStore();
    if (!authRequired && !credentials) {
        return { authenticated: true, user: "anonymous", method: "anonymous" };
    }
    if (authRequired && !credentials) {
        return {
            authenticated: false,
            user: "",
            method: "denied",
            reason: "Auth required but no tokens configured",
        };
    }

    if (masterToken && timingSafeTokenEqual(token, masterToken)) {
        return { authenticated: true, user: "admin", method: "master" };
    }

    for (const user of authUsers) {
        if (timingSafeTokenEqual(token, user.token)) {
            return { authenticated: true, user: user.name, method: "user" };
        }
    }

    try {
        const dbUser = AtabeyStorage.getUserByToken(token);
        if (dbUser) {
            return { authenticated: true, user: dbUser.name, method: "db" };
        }
    } catch {
        /* ignore */
    }

    return { authenticated: false, user: "", method: "denied", reason: "Invalid token" };
}

/**
 * Whether this path may be accessed without a valid token.
 */
export function isPublicPath(pathname: string): boolean {
    if (DEFAULT_PUBLIC_API_PATHS.has(pathname)) return true;
    // Static dashboard assets
    if (!pathname.startsWith("/api/") && !pathname.startsWith("/mcp/")) {
        return true;
    }
    return false;
}

/**
 * Require auth for a path. Returns 401 payload or null if allowed.
 */
export function requireAuthForPath(
    pathname: string,
    req: { headers: Record<string, string | string[] | undefined> },
): { allowed: true; user: string } | { allowed: false; status: 401; error: string } {
    if (isPublicPath(pathname)) {
        const auth = authenticate(req);
        return { allowed: true, user: auth.authenticated ? auth.user : "anonymous" };
    }

    // When auth not required and open access, allow
    if (!isAuthRequired() && !isAuthEnabled()) {
        return { allowed: true, user: "anonymous" };
    }

    // When credentials configured OR required → enforce
    if (isAuthRequired() || isAuthEnabled()) {
        const auth = authenticate(req);
        if (!auth.authenticated) {
            return {
                allowed: false,
                status: 401,
                error:
                    auth.reason ||
                    "Unauthorized. Provide Authorization: Bearer <token> header.",
            };
        }
        return { allowed: true, user: auth.user };
    }

    return { allowed: true, user: "anonymous" };
}

/**
 * Stdio mode user identity (not HTTP).
 */
export function getCurrentUser(): string {
    const envUser = process.env.MCP_USER;
    if (envUser) return envUser;

    try {
        const gitUser = execSync("git config user.name", { encoding: "utf8" }).trim();
        if (gitUser) return gitUser;
    } catch {
        /* ignore */
    }

    const systemUser = process.env.USER || process.env.USERNAME;
    if (systemUser) return systemUser;

    return "anonymous";
}

export function getAuthHeader(user: string, token: string): string {
    return `Bearer ${token}`;
}

export function getConfiguredUsers(): string[] {
    const list = new Set<string>();
    if (masterToken) list.add("admin");
    authUsers.forEach((u) => list.add(u.name));
    try {
        AtabeyStorage.getUsers().forEach((u) => list.add(u.name));
    } catch {
        /* ignore */
    }
    if (list.size === 0) return ["anonymous"];
    return Array.from(list);
}

export function getAuthStatus(): AuthStatus {
    if (!initialized) initAuth();
    let dbUserCount: number;
    try {
        dbUserCount = AtabeyStorage.getUsers().length;
    } catch {
        dbUserCount = 0;
    }
    const enabled = isAuthEnabled();
    return {
        enabled,
        required: authRequired,
        masterConfigured: !!masterToken,
        userCount: authUsers.length,
        dbUserCount,
        openAccess: !authRequired && !hasCredentialStore(),
        oidcConfigured: isOidcConfigured(),
    };
}

/** Test helper */
export function resetAuthForTests(): void {
    authUsers = [];
    masterToken = null;
    authRequired = false;
    initialized = false;
}

// Auto-initialize on load
initAuth();
