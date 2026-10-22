import http from "http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { logger } from "../../shared/logger.js";
import { describeTls, resolveTlsConfig } from "atabey-shared/tls.js";

export interface McpSession {
    transport: SSEServerTransport;
    server: Server;
    user: string;
    clientName: string;
    connectedAt: string;
    lastActivity: string;
    toolCalls: number;
}

export function serveJson(res: http.ServerResponse, statusCode: number, data: unknown) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function parseUrl(url: string): { pathname: string; params: Record<string, string> } {
    const [pathname, queryString] = url.split("?");
    const params: Record<string, string> = {};
    if (queryString) {
        queryString.split("&").forEach((pair) => {
            const idx = pair.indexOf("=");
            const key = idx === -1 ? pair : pair.slice(0, idx);
            const value = idx === -1 ? "" : pair.slice(idx + 1);
            if (key) params[decodeURIComponent(key)] = decodeURIComponent(value);
        });
    }
    return { pathname, params };
}

/**
 * Handles the unified HTTP(S) server routes.
 *
 * Only MCP-over-SSE endpoints are served here (`/mcp/*`). The Hermes WSS Bus
 * (`/bus`) is attached separately in `index.ts`. The former JSON REST API and
 * WebSocket live feed that backed the bundled web dashboard were removed.
 */
export async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: {
        serverVersion: string;
        sessions: Map<string, McpSession>;
        createServer: () => Server;
        broadcastWS: (type: string, payload: unknown) => void;
        projectRoot: string;
    }
): Promise<void> {
    const { serverVersion, sessions, createServer, broadcastWS, projectRoot: PROJECT_ROOT } = context;
    const url = req.url || "/";
    const { pathname, params } = parseUrl(url);

    // DNS Rebinding & Host header validation (protect loopback services against malicious web origins)
    const hostHeader = req.headers.host;
    if (hostHeader) {
        const hostWithoutPort = hostHeader.split(":")[0]?.toLowerCase();
        const isAllowedHost =
            hostWithoutPort === "localhost" ||
            hostWithoutPort === "127.0.0.1" ||
            hostWithoutPort === "::1" ||
            (process.env.ATABEY_ALLOWED_HOST && hostWithoutPort === process.env.ATABEY_ALLOWED_HOST.toLowerCase());
        if (!isAllowedHost) {
            logger.warn(`[SECURITY] Blocked request with suspicious Host header: ${hostHeader}`);
            serveJson(res, 403, { error: "Forbidden: Invalid Host header (DNS rebinding protection)" });
            return;
        }
    }

    // CORS — reflect only trusted origins (loopback or the configured origin).
    const origin = req.headers.origin;
    const isLocalOrigin = !origin ||
        origin.startsWith("http://localhost:") ||
        origin.startsWith("http://127.0.0.1:") ||
        origin.startsWith("https://localhost:") ||
        origin.startsWith("https://127.0.0.1:");
    if (isLocalOrigin) {
        res.setHeader("Access-Control-Allow-Origin", origin || "*");
    } else if (process.env.ATABEY_ALLOWED_ORIGIN && origin === process.env.ATABEY_ALLOWED_ORIGIN) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // ───────────── MCP ROUTES (prefix: /mcp, no auth) ─────
    if (pathname === "/mcp/health") {
        let transport = "plaintext";
        try {
            const tls = resolveTlsConfig();
            transport = tls.enabled ? describeTls(tls) : "plaintext";
        } catch (err) {
            logger.debug("TLS config resolution failed; reporting health transport as plaintext (non-fatal)", err);
        }
        // projectRoot lets stdio bridge candidates verify they attach to a hub
        // serving THEIR project (prevents silent cross-project bridging).
        serveJson(res, 200, { status: "ok", version: serverVersion, sessions: sessions.size, transport, projectRoot: PROJECT_ROOT });
        return;
    }

    // [SECURITY] Phase 2.1 — unified auth gate (MCP SSE when required/enabled)
    {
        const { requireAuthForPath, isAuthRequired, isAuthEnabled } = await import("../utils/auth.js");
        const needsGate =
            pathname.startsWith("/mcp/sse") ||
            pathname.startsWith("/mcp/messages");
        if (needsGate) {
            const decision = requireAuthForPath(pathname, req);
            if (!decision.allowed) {
                logger.warn(`[AUTH] Unauthorized request: ${pathname} (required=${isAuthRequired()} enabled=${isAuthEnabled()})`);
                serveJson(res, decision.status, {
                    error: decision.error,
                    hint: "Set MCP_AUTH_TOKEN and send Authorization: Bearer <token>",
                });
                return;
            }
        }
    }

    // ───────────── MCP SSE ───────────────────────────────
    if (pathname === "/mcp/sse") {
        const transport = new SSEServerTransport("/mcp/messages", res);
        const sessionId = transport.sessionId;
        const sessionServer = createServer();
        const { authenticate, getCurrentUser, isAuthRequired, isAuthEnabled } = await import("../utils/auth.js");
        const auth = authenticate(req);
        // When auth enforced, requireAuthForPath already validated; use auth.user
        const userName =
            auth.authenticated && auth.user !== "anonymous"
                ? auth.user
                : (isAuthRequired() || isAuthEnabled())
                    ? auth.user || "anonymous"
                    : getCurrentUser();
        const clientName = "mcp-client";
        const session: McpSession = {
            transport,
            server: sessionServer,
            user: userName,
            clientName,
            connectedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            toolCalls: 0,
        };
        sessions.set(sessionId, session);
        logger.info(`[MCP] Client connected: ${sessionId} (user: ${userName}, total: ${sessions.size})`);
        broadcastWS("mcp_session", { sessionId, user: userName, action: "connected", total: sessions.size });
        res.on("close", () => {
            sessions.delete(sessionId);
            void sessionServer.close().catch((err: unknown) => {
                logger.debug("Session server close failed; likely already closed", err);
            });
            logger.info(`[MCP] Client disconnected: ${sessionId} (user: ${userName}, remaining: ${sessions.size})`);
            broadcastWS("mcp_session", { sessionId, user: userName, action: "disconnected", total: sessions.size });
        });
        await sessionServer.connect(transport);
        return;
    }

    if (pathname === "/mcp/messages") {
        const sessionId = params.sessionId;
        if (!sessionId || !sessions.has(sessionId)) {
            serveJson(res, 400, { error: "Invalid or missing sessionId" });
            return;
        }
        const session = sessions.get(sessionId)!;
        session.lastActivity = new Date().toISOString();
        await session.transport.handlePostMessage(req, res);
        return;
    }

    // ───────────── ROOT & 404 ─────────────────────────────
    if (pathname === "/") {
        serveJson(res, 200, {
            status: "ok",
            server: "atabey-mcp",
            version: serverVersion,
            protocol: "Model Context Protocol (MCP)",
            endpoints: {
                mcp_health: "/mcp/health",
                mcp_sse: "/mcp/sse",
                mcp_messages: "/mcp/messages",
                hermes_bus: "/bus (WebSocket)",
            },
        });
        return;
    }

    serveJson(res, 404, { error: "Not Found" });
}
