import fs from "fs";
import path from "path";
import http from "http";
import { WebSocket } from "ws";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { logger } from "../../shared/logger.js";

import { handleCommonRoutes } from "./api-common.js";
import { handleAgentsRoutes } from "./api-agents.js";
import { handleOrchestratorRoutes } from "./api-orchestrator.js";
import { handleGovernanceRoutes } from "./api-governance.js";
import { handleWorkspaceRoutes } from "./api-workspace.js";
import { handleConfigRoutes } from "./api-config.js";

export interface McpSession {
    transport: SSEServerTransport;
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

export function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
    if (fs.existsSync(filePath)) {
        try {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { "Content-Type": contentType });
            res.end(content);
        } catch (e) {
            res.writeHead(500);
            res.end((e as Error).message);
        }
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
}

function parseUrl(url: string): { pathname: string; params: Record<string, string> } {
    const [pathname, queryString] = url.split("?");
    const params: Record<string, string> = {};
    if (queryString) {
        queryString.split("&").forEach((pair) => {
            const [key, value] = pair.split("=");
            params[decodeURIComponent(key)] = decodeURIComponent(value || "");
        });
    }
    return { pathname, params };
}

export async function handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: {
        serverVersion: string;
        sessions: Map<string, McpSession>;
        FRAMEWORK_DIR: string;
        PROJECT_ROOT: string;
        UI_DIST_PATH: string;
        server: Server;
        broadcastWS: (type: string, payload: unknown) => void;
        wsClients: Set<WebSocket>;
        HOST: string;
        PORT: number;
    }
): Promise<void> {
    const { serverVersion, sessions, UI_DIST_PATH, server, broadcastWS } = context;
    const url = req.url || "/";
    const { pathname, params } = parseUrl(url);

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // ───────────── MCP ROUTES (prefix: /mcp, no auth) ─────
    if (pathname === "/mcp/health") {
        serveJson(res, 200, { status: "ok", version: serverVersion, sessions: sessions.size });
        return;
    }

    // [SECURITY] Authentication check for API routes (not MCP/UI)
    const isApiRoute = pathname.startsWith("/api/");
    const isPublicApi = pathname === "/api/health" || pathname === "/api/agents" || pathname === "/api/status";
    if (isApiRoute && !isPublicApi) {
        const { authenticate } = await import("../utils/auth.js");
        const auth = authenticate(req);
        if (!auth.authenticated) {
            logger.warn(`[AUTH] Unauthorized request: ${pathname}`);
            serveJson(res, 401, { error: "Unauthorized. Provide Authorization: Bearer <token> header." });
            return;
        }
    }

    // ───────────── MCP SSE ───────────────────────────────
    if (pathname === "/mcp/sse") {
        const transport = new SSEServerTransport("/mcp/messages", res);
        const sessionId = transport.sessionId;
        const { authenticate, getCurrentUser } = await import("../utils/auth.js");
        const auth = authenticate(req);
        const userName = auth.authenticated ? auth.user : getCurrentUser();
        const clientName = "mcp-client";
        const session: McpSession = {
            transport,
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
            logger.info(`[MCP] Client disconnected: ${sessionId} (user: ${userName}, remaining: ${sessions.size})`);
            broadcastWS("mcp_session", { sessionId, user: userName, action: "disconnected", total: sessions.size });
        });
        await server.connect(transport);
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

    // ───────────── DASHBOARD API ROUTES (/api) ───────────
    if (isApiRoute) {
        const method = req.method || "GET";
        if (await handleCommonRoutes(pathname, params, method, req, res, context)) return;
        if (await handleAgentsRoutes(pathname, params, method, req, res, context)) return;
        if (await handleOrchestratorRoutes(pathname, params, method, req, res, context)) return;
        if (await handleGovernanceRoutes(pathname, params, method, req, res, context)) return;
        if (await handleWorkspaceRoutes(pathname, params, method, req, res, context)) return;
        if (await handleConfigRoutes(pathname, params, method, req, res, context)) return;
    }

    // SSE (legacy support)
    if (pathname === "/api/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
        res.write(": connected\n\n");
        const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 30000);
        req.on("close", () => clearInterval(keepAlive));
        return;
    }

    // ───────────── STATIC UI ─────────────────────────────
    const uiPath = path.join(UI_DIST_PATH, pathname === "/" ? "index.html" : pathname);
    const finalPath = (fs.existsSync(uiPath) && !fs.statSync(uiPath).isDirectory())
        ? uiPath
        : path.join(UI_DIST_PATH, "index.html");

    if (fs.existsSync(finalPath) && !fs.statSync(finalPath).isDirectory()) {
        const ext = path.extname(finalPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
            ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
            ".json": "application/json", ".png": "image/png", ".jpg": "image/jpg",
            ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon",
        };
        serveFile(res, finalPath, mimeTypes[ext] || "application/octet-stream");
    } else {
        serveJson(res, 404, { error: "Not Found" });
    }
}
