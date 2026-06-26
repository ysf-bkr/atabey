import { execSync } from "child_process";
import { AtabeyStorage } from "../../shared/storage.js";

/**
 * ─── MCP AUTHENTICATION ──────────────────────────────────────────
 *
 * Simple API key authentication for MCP server.
 * When MCP_AUTH_TOKEN is set, all MCP and API requests require
 * Authorization: Bearer <token> header.
 *
 * Supports multi-user setup via MCP_AUTH_USERS:
 *   MCP_AUTH_USERS=alice:key1,bob:key2,cmdr:key3
 *
 * Each user gets their own API key. Tool calls and audit logs
 * are tagged with the authenticated user's name.
 *
 * Environment Variables:
 *   MCP_AUTH_TOKEN     - Master API key for admin access (optional)
 *   MCP_AUTH_USERS     - Comma-separated list of user:token pairs (optional)
 *                        Example: "alice:key1,bob:key2"
 *
 * If neither is set, authentication is disabled (open access / anonymous).
 */

interface AuthUser {
    name: string;
    token: string;
}

let authUsers: AuthUser[] = [];
let masterToken: string | null = null;

/**
 * Initialize authentication from environment variables.
 */
export function initAuth(): void {
    masterToken = process.env.MCP_AUTH_TOKEN || null;

    const usersStr = process.env.MCP_AUTH_USERS || "";
    if (usersStr) {
        authUsers = usersStr.split(",").map(pair => {
            const [name, token] = pair.split(":");
            return { name: name?.trim() || "unknown", token: token?.trim() || "" };
        }).filter(u => u.token);
    }

    if (masterToken) {
        process.stderr.write(`[AUTH] Master token configured (${masterToken.length} chars)\n`);
    }
    if (authUsers.length > 0) {
        process.stderr.write(`[AUTH] ${authUsers.length} user(s) configured: ${authUsers.map(u => u.name).join(", ")}\n`);
    }
    try {
        const hasDbUsers = AtabeyStorage.hasUsers();
        if (hasDbUsers) {
            const dbUsers = AtabeyStorage.getUsers();
            process.stderr.write(`[AUTH] Database authentication active (${dbUsers.length} users configured)\n`);
        }
    } catch (e) {
        // storage not fully initialized yet
    }
    
    if (!masterToken && authUsers.length === 0 && !AtabeyStorage.hasUsers()) {
        process.stderr.write("[AUTH] No authentication configured - OPEN ACCESS (anonymous users)\n");
        process.stderr.write("[AUTH] Set MCP_AUTH_TOKEN=<key> or MCP_AUTH_USERS=user1:key1,user2:key2 to enable\n");
    }
}

/**
 * Authenticate a request using the Authorization header.
 * Returns the authenticated user name or null if unauthorized.
 */
export function authenticate(req: { headers: Record<string, string | string[] | undefined> }): { authenticated: boolean; user: string } {
    if (!masterToken && authUsers.length === 0 && !AtabeyStorage.hasUsers()) {
        // Auth disabled - allow all as anonymous
        return { authenticated: true, user: "anonymous" };
    }

    const authHeader = req.headers["authorization"] as string | undefined;
    if (!authHeader) {
        return { authenticated: false, user: "" };
    }

    // Support both "Bearer <key>" and "<key>" formats
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;

    // Check master token first
    if (masterToken && token === masterToken) {
        return { authenticated: true, user: "admin" };
    }

    // Check user tokens
    for (const user of authUsers) {
        if (token === user.token) {
            return { authenticated: true, user: user.name };
        }
    }

    // Check SQLite database users
    const dbUser = AtabeyStorage.getUserByToken(token);
    if (dbUser) {
        return { authenticated: true, user: dbUser.name };
    }

    return { authenticated: false, user: "" };
}

/**
 * Authenticate using a raw token string (for MCP stdio mode).
 * In stdio mode, the user identity is set via environment.
 */
export function authenticateToken(token: string): { authenticated: boolean; user: string } {
    if (!masterToken && authUsers.length === 0 && !AtabeyStorage.hasUsers()) {
        return { authenticated: true, user: "anonymous" };
    }

    // Check master token
    if (masterToken && token === masterToken) {
        return { authenticated: true, user: "admin" };
    }

    // Check user tokens
    for (const user of authUsers) {
        if (token === user.token) {
            return { authenticated: true, user: user.name };
        }
    }

    // Check SQLite database users
    const dbUser = AtabeyStorage.getUserByToken(token);
    if (dbUser) {
        return { authenticated: true, user: dbUser.name };
    }

    return { authenticated: false, user: "" };
}

/**
 * Get the current authenticated user identity for stdio mode.
 * Reads from environment or returns "anonymous".
 * For HTTP/SSE mode, use authenticate() on the request.
 */
export function getCurrentUser(): string {
    // Stdio mode: user identity comes from env or git config
    const envUser = process.env.MCP_USER;
    if (envUser) return envUser;

    try {
        const gitUser = execSync("git config user.name", { encoding: "utf8" }).trim();
        if (gitUser) return gitUser;
    } catch {
        // git not available
    }

    // Try system user
    const systemUser = process.env.USER || process.env.USERNAME;
    if (systemUser) return systemUser;

    return "anonymous";
}

/**
 * Generate authentication headers for MCP client configuration.
 */
export function getAuthHeader(user: string, token: string): string {
    return `Bearer ${token}`;
}

/**
 * Check if authentication is enabled.
 */
export function isAuthEnabled(): boolean {
    return !!masterToken || authUsers.length > 0 || AtabeyStorage.hasUsers();
}

/**
 * Get list of configured users (without tokens).
 */
export function getConfiguredUsers(): string[] {
    const list = new Set<string>();
    
    if (masterToken) {
        list.add("admin");
    }
    
    authUsers.forEach(u => list.add(u.name));
    
    try {
        const dbUsers = AtabeyStorage.getUsers();
        dbUsers.forEach(u => list.add(u.name));
    } catch (e) {
        // Storage not fully loaded
    }
    
    if (list.size === 0) {
        return ["anonymous"];
    }
    
    return Array.from(list);
}

// Auto-initialize on load
initAuth();
