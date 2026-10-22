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
import path from "path";
import { fileURLToPath } from "url";
import { HermesBus } from "./utils/wss-bus.js";

import { assertTransportSecurity, createHttpOrHttpsServer, describeTls, resolveTlsConfig, tlsScheme } from "atabey-shared/tls.js";
import { logger } from "../shared/logger.js";
import { handleCallToolWithGovernance } from "./middleware/governance.js";
import { RESOURCES, handleReadResource } from "./resources/index.js";
import { handleRequest } from "./routes/index.js";
import { TOOLS, filterTools } from "./tools/index.js";
import { bootstrapComplianceServices, shutdownComplianceServices } from "./utils/compliance-bootstrap.js";
import { bootstrapOrchestrator, shutdownOrchestrator } from "./utils/orchestrator-bootstrap.js";

if (!process.env.MCP_TRANSPORT) {
    process.env.MCP_TRANSPORT = "stdio";
}
if (process.env.MCP_TRANSPORT === "stdio") {
    logger.configure({ useStderr: true, enableColors: false });
}

// ─── Paths ────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Friendly Startup Validation ──────────────────────────────────

function validateEnvironment(): void {
    // Node.js version check
    const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
    if (nodeMajor < 22) {
        process.stderr.write(`
╔══════════════════════════════════════════════════════════╗
║  ⚠️  Unsupported Node.js version                       ║
╠══════════════════════════════════════════════════════════╣
║  Atabey MCP requires Node.js >= 22.0.0                  ║
║                                                         ║
║  Current version: ${process.versions.node}                             ║
║                                                         ║
║  📋  To fix this:                                       ║
║     nvm install 22 && nvm use 22   (if using nvm)      ║
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
const HOST = process.env.MCP_HOST || "127.0.0.1";

// ─── Port fallback (EADDRINUSE resilience) ───────────────────────────────────

/** How many consecutive ports to try when the preferred one is busy. */
const MAX_PORT_FALLBACK_ATTEMPTS = 20;

/**
 * Starts an HTTP server on `preferredPort`, retrying the next consecutive
 * ports when the address is already in use (multiple IDE windows, a stuck
 * background process, etc.). Set `ATABEY_PORT_STRICT=true` to disable the
 * fallback and fail fast on the first EADDRINUSE (useful in CI).
 */
export function listenWithFallback(
    server: import("node:http").Server,
    preferredPort: number,
    host: string,
    strict: boolean,
    onListening: () => void,
): void {
    let attempt = 0;

    // Register the success callback exactly ONCE: passing it to every
    // server.listen() call would queue one 'listening' listener per attempt,
    // firing the banner (and any post-listen setup) multiple times after a
    // successful retry.
    server.once("listening", onListening);

    const tryListen = (): void => {
        const candidate = preferredPort + attempt;
        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE" && !strict && attempt + 1 < MAX_PORT_FALLBACK_ATTEMPTS) {
                process.stderr.write(
                    `[atabey-mcp] Port ${candidate} in use — falling back to port ${candidate + 1}.\n`,
                );
                attempt += 1;
                server.close(); // release the failed listener before retrying
                tryListen();
                return;
            }
            // Exhausted (or strict mode): report and fail. Handled HERE — the
            // outer httpServer error handler is transport-agnostic and must
            // not race this listener on EADDRINUSE.
            if (err.code === "EADDRINUSE") {
                process.stderr.write(`\n[atabey-mcp] FATAL: All candidate ports (${preferredPort}..${preferredPort + MAX_PORT_FALLBACK_ATTEMPTS - 1}) are in use.\n`);
                process.stderr.write(`[atabey-mcp] Please terminate the existing process or start with a different port using MCP_PORT=<port>.\n\n`);
            } else {
                process.stderr.write(`[atabey-mcp] Server error: ${err.message}\n`);
            }
            process.exit(1);
        });
        server.listen(candidate, host);
    };

    tryListen();
}

// ─── Session Tracking (Multi-User) ────────────────────────────────

interface McpSession {
    transport: SSEServerTransport;
    server: Server;
    user: string;
    clientName: string;
    connectedAt: string;
    lastActivity: string;
    toolCalls: number;
}

// Track multiple SSE sessions with user identity
const sessions = new Map<string, McpSession>();

// ─── Live Event Broadcast (no-op) ─────────────────────────────────
// The bundled web dashboard was removed; this hook is retained so that
// governance/routing callers keep a stable signature.
function broadcastWS(_type: string, _payload: unknown): void {
    /* no live UI clients */
}

// ─── MCP Server Factory ───────────────────────────────────────────
// A single SDK `Server` instance can only be connected to one transport at a
// time. The stdio transport and every HTTP/SSE session therefore get their own
// instance — otherwise the second SSE client (or a stdio bridge) is rejected
// and the HTTP endpoint returns 500.
function createMcpServer(): Server {
    const instance = new Server(
        { name: "atabey-mcp", version: serverVersion },
        { capabilities: { tools: {}, resources: {} } }
    );

// ─── MCP Handlers ─────────────────────────────────────────────────

instance.setRequestHandler(ListToolsRequestSchema, async (request) => {
    const meta = (request as { _meta?: { client?: { name?: string; version?: string } } })._meta;
    const clientName = meta?.client?.name;
    if (meta) {
        process.stderr.write(`[MCP] ListTools from ${clientName || "unknown"} v${meta.client?.version || "?.?"}\n`);
    }
    const tools = filterTools(TOOLS, { clientName });
    return { tools };
});

instance.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: RESOURCES };
});

instance.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = (request as { params: { uri: string } }).params.uri;
    try {
        const content = await handleReadResource(uri);
        return { contents: [{ uri, mimeType: "text/markdown", text: content }] };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to read resource: ${message}`, { cause: error });
    }
});

instance.setRequestHandler(CallToolRequestSchema, async (request) => {
    const req = request as { params: { name: string; arguments?: Record<string, unknown> } };
    const { name, arguments: args } = req.params;
    const meta = (request as { _meta?: { client?: { name?: string; version?: string } } })._meta;

    if (meta) {
        process.stderr.write(`[MCP] CallTool: ${name} (Client: ${meta.client?.name || "unknown"})\n`);
    }

    // Enforce the client tool profile on CallTool, not just ListTools — a client
    // must not be able to invoke a tool that was hidden from its profile.
    const allowedTools = filterTools(TOOLS, { clientName: meta?.client?.name });
    if (!allowedTools.some((t) => t.name === name)) {
        return {
            isError: true,
            content: [{ type: "text" as const, text: `[PROFILE] Tool '${name}' is not available for this client profile.` }],
        };
    }

    // [OTEL] One span per tool call (W3C trace context + OTLP-shaped JSONL).
    const startMs = Date.now();
    let traceId = "";
    let spanId = "";
    try {
        const { newTraceId, newSpanId } = await import("atabey-shared/otel.js");
        traceId = newTraceId();
        spanId = newSpanId();
    } catch (err) { logger.debug("Server lifecycle operation failed (non-fatal)", err); }

    const result = await handleCallToolWithGovernance(name, args, meta, {
        PROJECT_ROOT,
        broadcastWS,
    });

    if (traceId) {
        try {
            const { emitSpan } = await import("atabey-shared/otel.js");
            emitSpan(PROJECT_ROOT, {
                name: `mcp.tool.${name}`,
                traceId,
                spanId,
                startMs,
                endMs: Date.now(),
                attributes: { "mcp.tool": name, "mcp.client": meta?.client?.name || "unknown", "mcp.error": result.isError === true },
                status: result.isError ? "ERROR" : "OK",
            });
        } catch (err) { logger.debug("Server lifecycle operation failed (non-fatal)", err); }
    }
    return result;
    });

    return instance;
}

// Primary instance used by the stdio transport (and by any future single
// transport mode). HTTP/SSE sessions create their own instance.
const server = createMcpServer();

// ─── Unified HTTP Server ──────────────────────────────────────────

function createUnifiedServer() {
    const tls = resolveTlsConfig();
    assertTransportSecurity(tls, HOST);
    const scheme = tlsScheme(tls);

    const httpServer = createHttpOrHttpsServer(tls, async (req, res) => {
        try {
            await handleRequest(req, res, {
                serverVersion,
                sessions,
                createServer: createMcpServer,
                broadcastWS,
                projectRoot: PROJECT_ROOT,
            });
        } catch (e) {
            process.stderr.write(`[SERVER ERROR] ${(e as Error).message}\n`);
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Internal Server Error" }));
        }
    });

    // ─── Hermes WSS Bus (distributed locks + inter-agent routing) ────
    // Zero extra dependency: reuses the same HTTP(S) server and `ws`.
    // [FIX] Attached only AFTER the server is actually listening. Attaching a
    // WebSocketServer to a not-yet-listening server corrupts the listen error
    // flow: the EADDRINUSE emitted during port-fallback retries then bypasses
    // every error handler and crashes the process as an uncaught exception.

    httpServer.on("error", (err: NodeJS.ErrnoException) => {
        // NOTE: EADDRINUSE is fully owned by listenWithFallback (port retry +
        // final fatal report). Handling it here as well would race the retry
        // listener and kill the process on the first busy port.
        if (err.code !== "EADDRINUSE") {
            process.stderr.write(`[atabey-mcp] Server error: ${err.message}\n`);
            process.exit(1);
        }
    });

    // ─── Start ───────────────────────────────────────────────
    // Start with automatic port fallback on EADDRINUSE (ATABEY_PORT_STRICT=true disables it).
    const strictPort = process.env.ATABEY_PORT_STRICT === "true";
    listenWithFallback(httpServer, PORT, HOST, strictPort, () => {
        const bound = httpServer.address();
        const boundPort = typeof bound === "object" && bound !== null ? bound.port : PORT;

        // Hermes WSS Bus attaches once the port is bound (see note above).
        const hermesBus = new HermesBus({ server: httpServer, path: "/bus" });
        process.stderr.write(
            `[atabey-mcp] Hermes WSS Bus attached at /bus (online: ${hermesBus.getStats().online.length})\n`,
        );

        process.stderr.write("\n");
        process.stderr.write("╔══════════════════════════════════════════════════════╗\n");
        process.stderr.write("║        ATABEY MCP SERVER                             ║\n");
        process.stderr.write("╠══════════════════════════════════════════════════════╣\n");
        process.stderr.write(`║  Transport:  ${describeTls(tls)}                     \n`);
        process.stderr.write(`║  MCP SSE:    ${scheme}://localhost:${boundPort}/mcp/sse        \n`);
        process.stderr.write(`║  MCP Health: ${scheme}://localhost:${boundPort}/mcp/health     \n`);
        process.stderr.write(`║  Hermes Bus: ${scheme === "https" ? "wss" : "ws"}://localhost:${boundPort}/bus          \n`);
        process.stderr.write(`║  Sessions:   ${sessions.size} active                  \n`);
        process.stderr.write("╚══════════════════════════════════════════════════════╝\n");
        process.stderr.write("\n");
        process.stderr.write(`[atabey-mcp] Unified server ready on port ${boundPort} (transport: ${describeTls(tls)})\n`);
        process.stderr.write(`[atabey-mcp] mcp.json: { "url": "${scheme}://localhost:${boundPort}/mcp/sse" }\n`);
        process.stderr.write("\n");
    });
}

// ─── Startup ──────────────────────────────────────────────────────

async function run() {
    const transportMode = process.env.MCP_TRANSPORT || "stdio";

    process.on("uncaughtException", (error: Error) => {
        process.stderr.write(`[atabey-mcp] FATAL uncaught exception: ${error.stack || error.message}\n`);
        // Fail-fast: the process may be in an inconsistent state; do not keep
        // serving tool calls. Give stdio a tick to flush, then exit non-zero.
        setTimeout(() => process.exit(1), 50);
    });
    process.on("unhandledRejection", (reason: unknown) => {
        const message = reason instanceof Error ? reason.stack || reason.message : String(reason);
        process.stderr.write(`[atabey-mcp] Unhandled rejection: ${message}\n`);
    });

    const shutdown = async () => {
        try { await shutdownComplianceServices(); } catch (err) { logger.debug("Server lifecycle operation failed (non-fatal)", err); }
        try { await shutdownOrchestrator(); } catch (err) { logger.debug("Server lifecycle operation failed (non-fatal)", err); }
        try { await server.close(); } catch (err) { logger.debug("Server lifecycle operation failed (non-fatal)", err); }
        process.exit(0);
    };

    bootstrapComplianceServices(PROJECT_ROOT);
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (transportMode === "stdio") {
        const isTestEnv = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);

        if (!isTestEnv) {
            const { probeHubHealth, runStdioBridge } = await import("./utils/hub-discovery.js");
            const existingHub = await probeHubHealth(PORT, HOST);

            // [SECURITY] Bridge ONLY when the existing hub provably serves THIS
            // project at a compatible version, and the user opted in. Otherwise
            // a hub from another project (or a fake listener on 5858) would
            // silently receive all of this process's tool calls and file reads.
            const bridgeOptIn = process.env.ATABEY_ALLOW_HUB_BRIDGE === "true";
            const sameProject = existingHub?.projectRoot === PROJECT_ROOT;
            const compatibleVersion = Boolean(existingHub?.version && existingHub.version === serverVersion);

            if (existingHub && bridgeOptIn && sameProject && compatibleVersion) {
                process.stderr.write(`[atabey-mcp] Verified Primary Hub for this project on port ${PORT} (sessions: ${existingHub.sessions}). Attaching as Stdio Bridge...\n`);
                await runStdioBridge(PORT, HOST);
                return;
            }

            if (existingHub && !bridgeOptIn) {
                process.stderr.write(`[atabey-mcp] Hub detected on port ${PORT} but bridge mode is disabled (set ATABEY_ALLOW_HUB_BRIDGE=true to attach).\n`);
            } else if (existingHub && !sameProject) {
                process.stderr.write(`[atabey-mcp] Hub on port ${PORT} serves a different project — not bridging (cross-project isolation).\n`);
            } else if (existingHub && !compatibleVersion) {
                process.stderr.write(`[atabey-mcp] Hub on port ${PORT} runs version ${existingHub.version} (expected ${serverVersion}) — not bridging.\n`);
            }

            process.stderr.write(`[atabey-mcp] Starting as PRIMARY HUB on port ${PORT} (auto port fallback enabled)...\n`);
            createUnifiedServer();
        }

        const transport = new StdioServerTransport();
        process.stderr.write("[atabey-mcp] Stdio mode connected to Primary Hub.\n");
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
