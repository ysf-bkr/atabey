#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListResourcesRequestSchema,
    ListToolsRequestSchema,
    ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";

import { Storage } from "../shared/storage.js";
import { handleCallToolWithGovernance } from "./middleware/governance.js";
import { RESOURCES, handleReadResource } from "./resources/index.js";
import { handleRequest } from "./routes/index.js";
import { TOOLS } from "./tools/index.js";
import { bootstrapComplianceServices, shutdownComplianceServices } from "./utils/compliance-bootstrap.js";
import { bootstrapOrchestrator, shutdownOrchestrator } from "./utils/orchestrator-bootstrap.js";

// ─── Paths ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Friendly Startup Validation ──────────────────────────────────

function validateEnvironment(): void {
    // Node.js version check
    const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
    if (nodeMajor < 18) {
        process.stderr.write(`
╔══════════════════════════════════════════════════════════╗
║  ⚠️  Unsupported Node.js version                       ║
╠══════════════════════════════════════════════════════════╣
║  Atabey MCP requires Node.js >= 18.0.0                  ║
║                                                         ║
║  Current version: ${process.versions.node}                             ║
║                                                         ║
║  📋  To fix this:                                       ║
║     nvm install 18 && nvm use 18   (if using nvm)      ║
║     brew install node             (if using Homebrew)  ║
║     https://nodejs.org            (official installer) ║
╚══════════════════════════════════════════════════════════╝
`);
        process.exit(1);
    }
}

function findPackageJson(startDir: string): string {
    let currentDir = startDir;
    while (currentDir !== path.parse(currentDir).root) {
        const pkgPath = path.join(currentDir, "package.json");
        if (fs.existsSync(pkgPath)) return pkgPath;
        currentDir = path.dirname(currentDir);
    }
    process.stderr.write(`
╔══════════════════════════════════════════════════════════╗
║  🚧  Package not found                                 ║
╠══════════════════════════════════════════════════════════╣
║  Atabey MCP package.json could not be located.          ║
║                                                         ║
║  This usually means:                                    ║
║    1. The package was not installed correctly           ║
║    2. Node modules are missing                          ║
║                                                         ║
║  📋  To fix this:                                       ║
║     npm install -g atabey        (global install)      ║
║     npm install                 (local install)        ║
║     npm run build               (if developing)        ║
╚══════════════════════════════════════════════════════════╝
`);
    process.exit(1);
}

validateEnvironment();

const pkgPath = findPackageJson(__dirname);
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const serverVersion = pkg.version;

// Validate environment variables with friendly messages
const PROJECT_ROOT = process.env.ATABEY_PROJECT_ROOT || process.cwd();
if (!process.env.ATABEY_PROJECT_ROOT) {
    const transportMode = process.env.MCP_TRANSPORT || "stdio";
    if (transportMode !== "stdio") {
        process.stderr.write(`
╔══════════════════════════════════════════════════════════╗
║  💡  Tip: Set ATABEY_PROJECT_ROOT                      ║
╠══════════════════════════════════════════════════════════╣
║  In HTTP/SSE mode, it's recommended to explicitly set   ║
║  the project root to avoid confusion.                   ║
║                                                         ║
║  Example:                                               ║
║    export ATABEY_PROJECT_ROOT=/path/to/your/project    ║
║                                                         ║
║  Using current directory: ${process.cwd()}         ║
╚══════════════════════════════════════════════════════════╝
`);
    }
}

const FRAMEWORK_DIR = process.env.ATABEY_FRAMEWORK_DIR || path.join(PROJECT_ROOT, ".atabey");

// Resolve dashboard UI dist path across monorepo and npm install layouts
function resolveDashboardPath(): string {
    const candidates = [
        // Monorepo dev layout (source)
        path.join(__dirname, "../../dashboard"),
        // Monorepo dev layout (built)
        path.join(__dirname, "../../dashboard/dist"),
        // npm global install layout
        path.join(__dirname, "../../dashboard/dist"),
        // npm local install (node_modules/atabey-mcp)
        path.join(PROJECT_ROOT, "node_modules/atabey-mcp/dashboard/dist"),
        path.join(PROJECT_ROOT, "node_modules/atabey-mcp/dashboard"),
        // Project root layouts
        path.join(PROJECT_ROOT, "dist/dashboard"),
        path.join(PROJECT_ROOT, "mcp/dist/dashboard"),
    ];
    for (const candidate of candidates) {
        const indexPath = path.join(candidate, "index.html");
        if (fs.existsSync(indexPath)) {
            return candidate;
        }
    }
    // Fallback — will show placeholder in the dashboard route handler
    return "";
}
const UI_DIST_PATH = resolveDashboardPath();

// ─── Ports ────────────────────────────────────────────────────────

const PORT = parseInt(process.env.MCP_PORT || "5858", 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    process.stderr.write(`
╔══════════════════════════════════════════════════════════╗
║  ❌  Invalid MCP_PORT                                   ║
╠══════════════════════════════════════════════════════════╣
║  The port must be a number between 1 and 65535.        ║
║                                                         ║
║  You set: MCP_PORT=${process.env.MCP_PORT || "(empty)"}                        ║
║                                                         ║
║  📋  To fix this:                                       ║
║     export MCP_PORT=5858   (default)                   ║
║     export MCP_PORT=8080   (alternative)               ║
╚══════════════════════════════════════════════════════════╝
`);
    process.exit(1);
}
const HOST = process.env.MCP_HOST || "0.0.0.0";

// ─── MCP Server ───────────────────────────────────────────────────

const server = new Server(
    { name: "atabey-mcp", version: serverVersion },
    { capabilities: { tools: {}, resources: {} } }
);

// ─── Session Tracking (Multi-User) ────────────────────────────────

interface McpSession {
    transport: SSEServerTransport;
    user: string;
    clientName: string;
    connectedAt: string;
    lastActivity: string;
    toolCalls: number;
}

// Track multiple SSE sessions with user identity
const sessions = new Map<string, McpSession>();

// ─── WebSocket Clients ────────────────────────────────────────────

const wsClients: Set<WebSocket> = new Set();

function broadcastWS(type: string, payload: unknown) {
    const msg = JSON.stringify({ type, payload });
    wsClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            try { ws.send(msg); } catch { wsClients.delete(ws); }
        } else {
            wsClients.delete(ws);
        }
    });
}



// ─── MCP Handlers ─────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const meta = (request as { _meta?: { client?: { name?: string; version?: string } } })._meta;
    if (meta) {
        process.stderr.write(`[MCP] ListTools from ${meta.client?.name || "unknown"} v${meta.client?.version || "?.?"}\n`);
    }
    return { tools: TOOLS };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: RESOURCES };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = (request as { params: { uri: string } }).params.uri;
    try {
        const content = await handleReadResource(uri);
        return { contents: [{ uri, mimeType: "text/markdown", text: content }] };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read resource: ${message}`, { cause: error });
    }
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const req = request as { params: { name: string; arguments?: Record<string, unknown> } };
    const { name, arguments: args } = req.params;
    const meta = (request as { _meta?: { client?: { name?: string; version?: string } } })._meta;

    if (meta) {
        process.stderr.write(`[MCP] CallTool: ${name} (Client: ${meta.client?.name || "unknown"})\n`);
    }

    return handleCallToolWithGovernance(name, args, meta, {
        PROJECT_ROOT,
        broadcastWS,
    });
});

// ─── Unified HTTP Server ──────────────────────────────────────────

function createUnifiedServer() {
    const httpServer = http.createServer(async (req, res) => {
        try {
            await handleRequest(req, res, {
                serverVersion,
                sessions,
                FRAMEWORK_DIR,
                PROJECT_ROOT,
                UI_DIST_PATH,
                server,
                broadcastWS,
                wsClients,
                HOST,
                PORT,
            });
        } catch (e) {
            process.stderr.write(`[SERVER ERROR] ${(e as Error).message}\n`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    });

    // ─── WebSocket Server ────────────────────────────────────
    const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

    // Bind Storage events to instant WebSocket broadcasts
    Storage.onMessageSaved = (msg) => {
        broadcastWS("message", msg);
    };
    Storage.onMessageStatusUpdated = (id, status) => {
        try {
            const row = Storage.getDB().prepare("SELECT trace_id FROM messages WHERE id = ?").get(id) as { trace_id: string } | undefined;
            if (row) {
                broadcastWS("approval", { traceId: row.trace_id, status });
            }
        } catch { /* ignore */ }
    };

    wss.on("connection", (ws) => {
        wsClients.add(ws);
        ws.send(JSON.stringify({ type: "mcp_session", payload: { total: sessions.size, sessions: Array.from(sessions.keys()) } }));
        ws.on("close", () => wsClients.delete(ws));
        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === "ping") ws.send(JSON.stringify({ type: "pong" }));
            } catch { /* ignore */ }
        });
    });

    // ─── Periodic Broadcast ──────────────────────────────────
    const broadcastInterval = setInterval(() => {
        try {
            broadcastWS("mcp_heartbeat", { sessions: sessions.size, timestamp: new Date().toISOString() });
        } catch { /* silent */ }
    }, 10000);

    httpServer.on("close", () => {
        clearInterval(broadcastInterval);
        wsClients.clear();
        Storage.onMessageSaved = null;
        Storage.onMessageStatusUpdated = null;
    });

    // ─── Start ───────────────────────────────────────────────
    httpServer.listen(PORT, HOST, () => {
        process.stderr.write("\n");
        process.stderr.write("╔══════════════════════════════════════════════════════╗\n");
        process.stderr.write("║        ATABEY UNIFIED SERVER                        ║\n");
        process.stderr.write("╠══════════════════════════════════════════════════════╣\n");
        process.stderr.write(`║  Dashboard:  http://localhost:${PORT}                 \n`);
        process.stderr.write(`║  MCP SSE:    http://localhost:${PORT}/mcp/sse        \n`);
        process.stderr.write(`║  WS Live:    ws://localhost:${PORT}/ws               \n`);
        process.stderr.write(`║  API:        http://localhost:${PORT}/api/health     \n`);
        process.stderr.write(`║  Sessions:   ${sessions.size} active                  \n`);
        process.stderr.write("╚══════════════════════════════════════════════════════╝\n");
        process.stderr.write("\n");
        process.stderr.write(`[atabey-mcp] Unified server ready on port ${PORT}\n`);
        process.stderr.write(`[atabey-mcp] mcp.json: { "url": "http://localhost:${PORT}/mcp/sse" }\n`);
        process.stderr.write("\n");
    });
}

// ─── Startup ──────────────────────────────────────────────────────

async function run() {
    const transportMode = process.env.MCP_TRANSPORT || "stdio";

    process.on("uncaughtException", (error: Error) => {
        process.stderr.write(`[atabey-mcp] Uncaught exception: ${error.message}\n`);
    });
    process.on("unhandledRejection", (reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        process.stderr.write(`[atabey-mcp] Unhandled rejection: ${message}\n`);
    });

    const shutdown = async () => {
        try { await shutdownComplianceServices(); } catch { /* ignore */ }
        try { await shutdownOrchestrator(); } catch { /* ignore */ }
        try { await server.close(); } catch { /* ignore */ }
        process.exit(0);
    };

    bootstrapComplianceServices(PROJECT_ROOT);
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (transportMode === "stdio") {
        const transport = new StdioServerTransport();
        process.stderr.write("[atabey-mcp] Stdio mode (single client).\n");
        await server.connect(transport);
        bootstrapOrchestrator(PROJECT_ROOT).catch((e) => {
            process.stderr.write(`[atabey-mcp] Orchestrator bootstrap failed: ${(e as Error).message}\n`);
        });
    } else {
        createUnifiedServer();
        bootstrapOrchestrator(PROJECT_ROOT).catch((e) => {
            process.stderr.write(`[atabey-mcp] Orchestrator bootstrap failed: ${(e as Error).message}\n`);
        });
    }
}

run().catch((error: Error) => {
    process.stderr.write(`[atabey-mcp] Fatal startup error: ${error.message}\n`);
    process.exit(1);
});
