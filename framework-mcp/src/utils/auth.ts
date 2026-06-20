/**
 * ─── MCP AUTHENTICATION ──────────────────────────────────────────
 *
 * Simple API key authentication for MCP server.
 * When MCP_AUTH_TOKEN is set, all MCP and API requests require
 * Authorization: Bearer <token> header.
 *
 * Environment Variables:
 *   MCP_AUTH_TOKEN     - API key for authentication (optional)
 *   MCP_AUTH_USERS     - Comma-separated list of user:token pairs (optional)
 *                        Example: "alice:key1,bob:key2"
 *
 * If neither is set, authentication is disabled (open access).
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
    if (!masterToken && authUsers.length === 0) {
        process.stderr.write("[AUTH] No authentication configured - OPEN ACCESS\n");
        process.stderr.write("[AUTH] Set MCP_AUTH_TOKEN=<key> or MCP_AUTH_USERS=user1:key1,user2:key2 to enable\n");
    }
}

/**
 * Authenticate a request using the Authorization header.
 * Returns the authenticated user name or null if unauthorized.
 */
export function authenticate(req: { headers: Record<string, string | string[] | undefined> }): { authenticated: boolean; user: string } {
    if (!masterToken && authUsers.length === 0) {
        // Auth disabled - allow all
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

    return { authenticated: false, user: "" };
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
    return !!masterToken || authUsers.length > 0;
}
