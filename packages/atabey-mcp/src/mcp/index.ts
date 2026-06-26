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

import { generateULID } from "../cli/utils/time.js";
import { Audit } from "../shared/audit.js";
import { maskText, maskToolArgs, maskToolResult } from "../shared/pii.js";
import { Storage } from "../shared/storage.js";
import { RESOURCES, handleReadResource } from "./resources/index.js";
import { TOOLS, toolHandlers, toolSchemas } from "./tools/index.js";

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
    const transportMode = process.env.MCP_TRANSPORT || "unified";
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
let UI_DIST_PATH = path.join(__dirname, "../../dashboard");
if (!fs.existsSync(UI_DIST_PATH) || !fs.existsSync(path.join(UI_DIST_PATH, "index.html"))) {
    UI_DIST_PATH = path.join(__dirname, "../../dashboard/dist");
}
if (!fs.existsSync(UI_DIST_PATH) || !fs.existsSync(path.join(UI_DIST_PATH, "index.html"))) {
    UI_DIST_PATH = path.join(PROJECT_ROOT, "dist/dashboard");
}
if (!fs.existsSync(UI_DIST_PATH) || !fs.existsSync(path.join(UI_DIST_PATH, "index.html"))) {
    UI_DIST_PATH = path.join(PROJECT_ROOT, "mcp/dist/dashboard");
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

// ─── Validation ───────────────────────────────────────────────────

function validateArgs(toolName: string, args: Record<string, unknown>): string | null {
    const schema = toolSchemas[toolName];
    if (schema) {
        const result = schema.safeParse(args);
        if (!result.success) {
            return result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
        }
        return null;
    }
    const definition = TOOLS.find(t => t.name === toolName);
    if (!definition) return `Unknown tool: ${toolName}`;
    const required = definition.inputSchema.required || [];
    for (const field of required) {
        if (args[field] === undefined || args[field] === null || args[field] === "") {
            return `Missing required argument: '${field}' for tool '${toolName}'`;
        }
    }
    return null;
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

    try {
        const handler = toolHandlers[name];
        if (!handler) {
            return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Unknown tool: ${name}` }] };
        }

        const validationError = validateArgs(name, args || {});
        if (validationError) {
            return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Validation Error: ${validationError}` }] };
        }

        // [PII/GDPR/KVKK] Mask args before handler
        const maskedArgs = maskToolArgs(args || {});

        // [TOKEN ECONOMY] Log token usage
        const argsJson = JSON.stringify(maskedArgs);
        const estimatedTokens = Math.ceil(argsJson.length / 4);
        const clientAgent = meta?.client?.name || "mcp-client";
        try {
            const { Metrics } = await import("./utils/metrics.js");
            Metrics.logUsage(PROJECT_ROOT, clientAgent, name, estimatedTokens);
        } catch (e) { process.stderr.write(`[METRICS] Error: ${(e as Error).message}\n`); }

        // [GOVERNANCE] Validate arguments against governance rules (pre-execution)
        try {
            const { validateArgsAgainstRules } = await import("./utils/rules-engine.js");
            const governanceError = validateArgsAgainstRules(name, maskedArgs);
            if (governanceError) {
                process.stderr.write(`[GOVERNANCE] Blocked: ${governanceError}\n`);
                broadcastWS("governance_violation", { agent: clientAgent, tool: name, error: governanceError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: governanceError }] };
            }
        } catch (e) { process.stderr.write(`[GOVERNANCE] Module error: ${(e as Error).message}\n`); }

        // [DISCIPLINE] Enforce AI discipline at tool level BEFORE execution
        try {
            const { enforceDiscipline } = await import("./utils/discipline.js");
            const disciplineError = await enforceDiscipline(clientAgent, name, maskedArgs);
            if (disciplineError) {
                process.stderr.write(`[DISCIPLINE] Blocked: ${disciplineError}\n`);
                broadcastWS("discipline_violation", { agent: clientAgent, tool: name, error: disciplineError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: `[DISCIPLINE] ${disciplineError}` }] };
            }
        } catch (e) { process.stderr.write(`[DISCIPLINE] Module error: ${(e as Error).message}\n`); }

        // [SILENT ROUTER] Detect agent from context and inject rules
        const traceId = generateULID();
        let detectedAgent = clientAgent;
        try {
            const { detectAgent, stealthNotify } = await import("./utils/silent-router.js");
            detectedAgent = detectAgent(name, maskedArgs);
            if (detectedAgent !== clientAgent) {
                stealthNotify(detectedAgent, name, `Silently routed from ${clientAgent}`);
                process.stderr.write(`[SILENT ROUTER] ${name} → ${detectedAgent} (from ${clientAgent})\n`);
            }
        } catch (e) { process.stderr.write(`[SILENT ROUTER] Error: ${(e as Error).message}\n`); }

        // [CRUD GOVERNANCE] Verify agent permissions for high-risk operations
        try {
            const { GovernanceEngine } = await import("../../modules/engines/crud-governance.js");
            const taskStr = name === "run_shell_command" ? (maskedArgs.command as string || "") : `${name} ${argsJson}`;
            const operation = GovernanceEngine.classifyTask(taskStr);
            if (operation) {
                const decision = await GovernanceEngine.evaluate(detectedAgent, operation, taskStr, traceId);
                if (decision.requiresApproval) {
                    process.stderr.write(`[GOVERNANCE] Blocked: ${decision.reason}\n`);
                    broadcastWS("governance_violation", { agent: detectedAgent, tool: name, error: decision.reason, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: `[GOVERNANCE] Blocked: ${decision.reason}` }] };
                }
            }
        } catch (e) {
            process.stderr.write(`[GOVERNANCE] evaluate error: ${(e as Error).message}\n`);
        }

        // [LOOP DETECTION] Check for infinite loop patterns
        try {
            const { recordAndCheck } = await import("./utils/loop-detector.js");
            const loopAlert = recordAndCheck(detectedAgent, name, maskedArgs);
            if (loopAlert) {
                process.stderr.write(`[LOOP DETECT] ${loopAlert.type}: ${loopAlert.detail}\n`);
                broadcastWS("loop_detected", { agent: detectedAgent, tool: name, alert: loopAlert, timestamp: new Date().toISOString() });
                if (loopAlert.severity === "critical" && loopAlert.cooldownUntil) {
                    const remaining = Math.ceil((loopAlert.cooldownUntil - Date.now()) / 1000);
                    return {
                        isError: true,
                        content: [{ type: "text" as const, text: `[LOOP DETECTED] ${loopAlert.detail} Cooldown: ${remaining}s. Please change your approach.` }]
                    };
                }
            }
        } catch (e) { process.stderr.write(`[LOOP DETECT] Error: ${(e as Error).message}\n`); }

        // [FINOPS] Check budget BEFORE execution (record usage)
        try {
            const { budgetManager } = await import("./utils/finops.js");
            const budgetError = budgetManager.recordUsage(detectedAgent, estimatedTokens);
            if (budgetError) {
                process.stderr.write(`[FINOPS] Budget blocked: ${budgetError}\n`);
                broadcastWS("budget_blocked", { agent: detectedAgent, tool: name, error: budgetError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: budgetError }] };
            }
        } catch (e) { process.stderr.write(`[FINOPS] Error: ${(e as Error).message}\n`); }

        // [LICENSE] Validate write content for license compliance (pre-execution)
        if (name === "write_file" || name === "replace_text" || name === "patch_file") {
            try {
                const { validateLicenseCompliance } = await import("./utils/license-scanner.js");
                const filePath = (maskedArgs.path as string) || "";
                const content = (maskedArgs.content as string) || "";
                if (filePath && content) {
                    const licenseError = validateLicenseCompliance(filePath, content);
                    if (licenseError) {
                        process.stderr.write(`[LICENSE] Blocked: ${licenseError}\n`);
                        broadcastWS("license_violation", { agent: detectedAgent, tool: name, error: licenseError, timestamp: new Date().toISOString() });
                        return { isError: true, content: [{ type: "text" as const, text: licenseError }] };
                    }
                }
            } catch (e) { process.stderr.write(`[LICENSE] Error: ${(e as Error).message}\n`); }
        }

        // [AUTO-ROLLBACK] Prepare snapshot for write operations
        if (name === "write_file" || name === "replace_text" || name === "patch_file") {
            try {
                const { AutoRollbackEngine } = await import("./utils/auto-rollback.js");
                const filePath = (maskedArgs.path as string) || "";
                if (filePath) {
                    AutoRollbackEngine.prepareWrite(filePath, traceId);
                }
            } catch (e) { process.stderr.write(`[AUTO-ROLLBACK] Prepare error: ${(e as Error).message}\n`); }
        }

        // [HUMAN-IN-LOOP] Check risk gate before execution
        try {
            const { RiskEngine } = await import("../../modules/engines/risk-engine.js");
            const riskContext = `${name} ${JSON.stringify(maskedArgs)}`;
            const riskResult = RiskEngine.assessTaskRisk(riskContext);
            if (riskResult.totalScore > 0) {
                const { checkRiskGate } = await import("./utils/human-in-loop.js");
                const riskReason = riskResult.factors.map(f => f.description).join("; ") || "High-risk operation detected";
                const gateResult = checkRiskGate(traceId, name, detectedAgent, riskResult.totalScore, riskReason, maskedArgs);
                if (gateResult?.blocked) {
                    process.stderr.write(`[RISK GATE] Blocked: ${riskReason} (score: ${riskResult.totalScore})\n`);
                    broadcastWS("risk_blocked", { agent: detectedAgent, tool: name, riskScore: riskResult.totalScore, traceId, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: gateResult.message! }] };
                }
                if (gateResult?.warning) {
                    process.stderr.write(`[RISK WARNING] ${gateResult.warning}\n`);
                }
            }
        } catch (e) { process.stderr.write(`[RISK GATE] Error: ${(e as Error).message}\n`); }

        // Execute
        const result = await handler(PROJECT_ROOT, maskedArgs);

        // [AUTO-ROLLBACK] Check write results for governance violations
        if (name === "write_file" || name === "replace_text" || name === "patch_file") {
            try {
                const filePath = (maskedArgs.path as string) || "";
                const content = (maskedArgs.content as string) || "";
                if (filePath && content) {
                    const { AutoRollbackEngine } = await import("./utils/auto-rollback.js");
                    const { scanFileForViolations } = await import("./utils/rules-engine.js");
                    const violations = scanFileForViolations(filePath, content);
                    if (violations.length > 0) {
                        const violationRecords = violations.map(v => ({
                            rule: v.rule.name,
                            severity: v.rule.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
                            filePath,
                            line: v.line,
                            detail: `Line ${v.line}: ${v.match}`,
                            regenerateInstruction: v.rule.errorMessage,
                        }));
                        const rolledBack = AutoRollbackEngine.validateAndRollback(filePath, content, violationRecords);
                        if (rolledBack) {
                            const instruction = AutoRollbackEngine.buildRegenerateInstruction(rolledBack, name);
                            broadcastWS("rollback_violation", { agent: detectedAgent, tool: name, violations: rolledBack, timestamp: new Date().toISOString() });
                            return { isError: true, content: [{ type: "text" as const, text: instruction }] };
                        }
                    }
                }
            } catch (e) { process.stderr.write(`[AUTO-ROLLBACK] Validate error: ${(e as Error).message}\n`); }
        }

        // [DISCIPLINE] Validate response content BEFORE returning to AI
        try {
            const { validateResponse } = await import("./utils/discipline.js");
            const responseError = validateResponse(name, result);
            if (responseError) {
                process.stderr.write(`[DISCIPLINE] Response blocked: ${responseError}\n`);
                broadcastWS("discipline_violation", { agent: detectedAgent, tool: name, error: responseError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: `[DISCIPLINE] ${responseError}` }] };
            }
        } catch (e) { process.stderr.write(`[DISCIPLINE] Response validation error: ${(e as Error).message}\n`); }

        // [INJECTION PROTECTION] Sanitize prompt injection attempts in response text
        try {
            const { PromptInjectionProtection } = await import("./utils/prompt-injection.js");
            if (result.content) {
                for (let i = 0; i < result.content.length; i++) {
                    const block = result.content[i];
                    if (block.type === "text" && block.text) {
                        const scan = PromptInjectionProtection.sanitizeResponse(block.text);
                        if (scan.detected) {
                            process.stderr.write(`[INJECTION PROTECTION] Neutralized prompt injection pattern: ${scan.patterns.join(", ")}\n`);
                            // Record in immutable logs
                            const { Storage } = await import("../shared/storage.js");
                            Storage.saveLog({
                                agent: detectedAgent,
                                action: "INJECTION_DETECTION",
                                trace_id: traceId || undefined,
                                status: "WARNING",
                                summary: `Prompt injection patterns neutralized: ${scan.patterns.join(", ")}`,
                            });
                            // Broadcast to dashboard
                            broadcastWS("injection_violation", {
                                agent: detectedAgent,
                                tool: name,
                                patterns: scan.patterns,
                                timestamp: new Date().toISOString()
                            });
                            result.content[i] = {
                                ...block,
                                text: scan.sanitized,
                            };
                        }
                    }
                }
            }
        } catch (err) {
            process.stderr.write(`[INJECTION PROTECTION] Error: ${(err as Error).message}\n`);
        }

        // [GOVERNANCE] Validate response against governance rules (post-execution)
        try {
            const { validateResponseAgainstRules } = await import("./utils/rules-engine.js");
            const responseText = result.content?.filter(b => b.type === "text").map(b => b.text).join(" ") || "";
            const govResponseError = validateResponseAgainstRules(name, responseText);
            if (govResponseError) {
                process.stderr.write(`[GOVERNANCE] Response violation: ${govResponseError}\n`);
                broadcastWS("governance_violation", { agent: detectedAgent, tool: name, error: govResponseError, timestamp: new Date().toISOString() });
                // Don't block the response, just warn
            }
        } catch (e) { process.stderr.write(`[GOVERNANCE] Response validation error: ${(e as Error).message}\n`); }

        // [CONTEXT OPTIMIZER] Check token budget after execution
        try {
            const { checkTokenBudget } = await import("./utils/context-optimizer.js");
            const responseText = result.content?.filter(b => b.type === "text").map(b => b.text).join(" ") || "";
            const budgetError = checkTokenBudget(detectedAgent, name, responseText);
            if (budgetError) {
                process.stderr.write(`[TOKEN BUDGET] Warning: ${budgetError}\n`);
                broadcastWS("token_budget_warning", { agent: detectedAgent, tool: name, error: budgetError, timestamp: new Date().toISOString() });
            }
        } catch (e) { process.stderr.write(`[TOKEN BUDGET] Error: ${(e as Error).message}\n`); }

        // [SILENT ROUTER] Build silent context injection
        try {
            const { buildSilentContext } = await import("./utils/silent-router.js");
            if (result.content) {
                for (let i = 0; i < result.content.length; i++) {
                    const block = result.content[i];
                    if (block.type === "text") {
                        result.content[i] = {
                            ...block,
                            text: await buildSilentContext(detectedAgent, name, block.text),
                        };
                    }
                }
            }
        } catch (e) { process.stderr.write(`[SILENT ROUTER] Context injection error: ${(e as Error).message}\n`); }

        // Broadcast to dashboard WS
        broadcastWS("tool_call", { agent: detectedAgent, action: name, tokens: estimatedTokens, traceId, timestamp: new Date().toISOString() });

        // [PII/GDPR/KVKK] Mask result before returning to AI
        return maskToolResult(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Execution failed: ${message}` }] };
    }
});

// ─── API Helpers ──────────────────────────────────────────────────

function serveJson(res: http.ServerResponse, statusCode: number, data: unknown) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

function serveFile(res: http.ServerResponse, filePath: string, contentType: string) {
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

// ─── Unified HTTP Server ──────────────────────────────────────────

function createUnifiedServer() {
    const httpServer = http.createServer(async (req, res) => {
        const url = req.url || "/";
        const { pathname, params } = parseUrl(url);
        const method = req.method || "GET";

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
            const { authenticate } = await import("./utils/auth.js");
            const auth = authenticate(req);
            if (!auth.authenticated) {
                process.stderr.write(`[AUTH] Unauthorized request: ${pathname}\n`);
                serveJson(res, 401, { error: "Unauthorized. Provide Authorization: Bearer <token> header." });
                return;
            }
        }

        // ───────────── MCP SSE ───────────────────────────────

        if (pathname === "/mcp/sse") {
            const transport = new SSEServerTransport("/mcp/messages", res);
            const sessionId = transport.sessionId;
            // Get user identity from auth header or default to anonymous
            const { authenticate, getCurrentUser } = await import("./utils/auth.js");
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
            process.stderr.write(`[MCP] Client connected: ${sessionId} (user: ${userName}, total: ${sessions.size})\n`);
            broadcastWS("mcp_session", { sessionId, user: userName, action: "connected", total: sessions.size });
            res.on("close", () => {
                sessions.delete(sessionId);
                process.stderr.write(`[MCP] Client disconnected: ${sessionId} (user: ${userName}, remaining: ${sessions.size})\n`);
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

        // Health
        if (pathname === "/api/health") {
            serveJson(res, 200, { status: "healthy", version: serverVersion, frameworkDir: FRAMEWORK_DIR });
            return;
        }

        // Status
        if (pathname === "/api/status") {
            const statusPath = path.join(FRAMEWORK_DIR, "memory", "status.json");
            if (fs.existsSync(statusPath)) {
                serveFile(res, statusPath, "application/json");
                return;
            }
            serveJson(res, 200, { success: true, data: { status: "initializing" } });
            return;
        }

        // Memory (PROJECT_MEMORY.md)
        if (pathname === "/api/memory") {
            const memoryPath = path.join(FRAMEWORK_DIR, "memory", "PROJECT_MEMORY.md");
            if (fs.existsSync(memoryPath)) {
                serveFile(res, memoryPath, "text/markdown");
                return;
            }
            serveJson(res, 200, { success: true, data: "No memory file yet." });
            return;
        }

        // Memory Search
        if (pathname === "/api/memory/search") {
            try {
                const query = params.q || "";
                const limit = parseInt(params.limit || "10", 10);
                if (!query) {
                    const db = Storage.getDB();
                    const rows = db.prepare("SELECT * FROM vector_memory ORDER BY created_at DESC LIMIT ?").all(limit) as Array<{
                        id: string; content: string; category: string; metadata: string; created_at: string;
                    }>;
                    // [KVKK/GDPR] Mask PII in memory content before returning
                    const results = rows.map(row => {
                        const meta = JSON.parse(row.metadata || "{}");
                        return { id: row.id, content: maskText(row.content), type: row.category || meta.category || "memory", timestamp: meta.createdAt || row.created_at, relevance: 1.0 };
                    });
                    serveJson(res, 200, { success: true, data: results });
                    return;
                }
                const { CoreMemory } = await import("../../modules/memory/core.js");
                const results = await CoreMemory.recall(query, { limit });
                // [KVKK/GDPR] Mask PII in memory content before returning
                const flattened = results.map(r => ({
                    id: r.entry.id, content: maskText(r.entry.content), type: r.entry.metadata.category || "memory",
                    timestamp: r.entry.metadata.createdAt || new Date().toISOString(), relevance: r.score
                }));
                serveJson(res, 200, { success: true, data: flattened });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Agents
        if (pathname === "/api/agents") {
            try {
                const agents = Storage.getAllAgents();
                serveJson(res, 200, { success: true, data: agents });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // POST Create Agent
        if (pathname === "/api/agents/create" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name, description, skills } = parsed;
                        if (!name) {
                            serveJson(res, 400, { success: false, error: "name parameter is required" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        AtabeyStorage.createAgent(name, description || "", skills || "[]");
                        broadcastWS("agent_update", AtabeyStorage.getAllAgents());
                        serveJson(res, 200, { success: true, message: `Agent ${name} created.` });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // POST Delete Agent
        if (pathname.startsWith("/api/agents/delete/") && method === "POST") {
            const agentName = decodeURIComponent(pathname.replace("/api/agents/delete/", ""));
            if (!agentName) { serveJson(res, 400, { success: false, error: "Agent name required" }); return; }
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const deleted = AtabeyStorage.deleteAgent(agentName);
                if (deleted) {
                    broadcastWS("agent_update", AtabeyStorage.getAllAgents());
                    serveJson(res, 200, { success: true, message: `Agent ${agentName} deleted.` });
                } else {
                    serveJson(res, 404, { success: false, error: `Agent ${agentName} not found.` });
                }
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // POST Update Agent Details
        if (pathname === "/api/agents/update" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name, description, state, task, skills } = parsed;
                        if (!name) {
                            serveJson(res, 400, { success: false, error: "name parameter is required" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        AtabeyStorage.updateAgentDetails(
                            name,
                            description || "Otonom Uzman Ajan",
                            state || "READY",
                            task || "Idle",
                            typeof skills === "string" ? skills : JSON.stringify(skills || [])
                        );
                        broadcastWS("agent_update", AtabeyStorage.getAllAgents());
                        serveJson(res, 200, { success: true, message: `Agent ${name} updated successfully.` });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Messages (Hermes queue)
        if (pathname === "/api/messages") {
            try {
                const messages = Storage.getPendingMessages();
                serveJson(res, 200, { success: true, data: messages });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Hermes Stats
        if (pathname === "/api/hermes/stats") {
            try {
                const messages = Storage.getPendingMessages();
                const totalMessages = Storage.getDB().prepare("SELECT COUNT(*) as count FROM messages").get() as { count: number };
                const byCategory: Record<string, number> = {};
                const byStatus: Record<string, number> = {};
                messages.forEach(m => {
                    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
                    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
                });
                serveJson(res, 200, {
                    success: true, data: {
                        total: totalMessages.count, pending: messages.length, byCategory, byStatus,
                        lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Tasks
        if (pathname === "/api/tasks") {
            try {
                const { asTraceID } = await import("../shared/types.js");
                const traceId = params.traceId ? asTraceID(params.traceId) : undefined;
                const tasks = Storage.getTasks(traceId);
                // [KVKK/GDPR] Mask PII in task descriptions before returning
                const maskedTasks = tasks.map(t => ({
                    ...t,
                    description: maskText(t.description),
                }));
                serveJson(res, 200, { success: true, data: maskedTasks });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Logs
        if (pathname.startsWith("/api/logs")) {
            try {
                const logs = Storage.getLogs();
                const agent = pathname.split("/api/logs/")[1];
                const filteredLogs = agent ? logs.filter(l => l.agent === agent) : logs;
                serveJson(res, 200, { success: true, data: filteredLogs });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Approvals
        if (pathname === "/api/approvals") {
            try {
                const allMessages = Storage.getPendingMessages();
                // [KVKK/GDPR] Mask PII in approval descriptions
                const approvals = allMessages.filter(m => m.category === "ALERT" || m.category === "ACTION")
                    .map(m => ({
                        id: String(m.id || m.traceId), traceId: m.traceId,
                        description: m.content ? (typeof m.content === "string" ? maskText(m.content) : maskText(JSON.stringify(m.content))) : "Approval required",
                        status: m.status || "PENDING", timestamp: m.timestamp || new Date().toISOString()
                    }));
                serveJson(res, 200, { success: true, data: approvals });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Approve
        if (pathname.startsWith("/api/approve/") && method === "POST") {
            const traceId = pathname.replace("/api/approve/", "");
            if (!traceId) { serveJson(res, 400, { success: false, error: "Trace ID required" }); return; }
            try {
                const pendingMessages = Storage.getPendingMessages().filter(m => m.traceId === traceId && (m.category === "ALERT" || m.category === "ACTION"));
                if (pendingMessages.length === 0) { serveJson(res, 404, { success: false, error: "No pending approval found" }); return; }
                const { approveOperation } = await import("./utils/human-in-loop.js");
                const result = approveOperation(traceId, undefined, undefined, true);
                if (result.success) {
                    broadcastWS("approval", { traceId, status: "APPROVED" });
                    serveJson(res, 200, { success: true, message: result.message, approved: pendingMessages.length });
                } else {
                    serveJson(res, 400, { success: false, error: result.message });
                }
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Reject
        if (pathname.startsWith("/api/reject/") && method === "POST") {
            const traceId = pathname.replace("/api/reject/", "");
            if (!traceId) { serveJson(res, 400, { success: false, error: "Trace ID required" }); return; }
            try {
                const pendingMessages = Storage.getPendingMessages().filter(m => m.traceId === traceId && (m.category === "ALERT" || m.category === "ACTION"));
                if (pendingMessages.length === 0) { serveJson(res, 404, { success: false, error: "No pending approval found" }); return; }
                const { rejectOperation } = await import("./utils/human-in-loop.js");
                const result = rejectOperation(traceId, undefined, true);
                if (result.success) {
                    broadcastWS("approval", { traceId, status: "REJECTED" });
                    serveJson(res, 200, { success: true, message: result.message, rejected: pendingMessages.length });
                } else {
                    serveJson(res, 400, { success: false, error: result.message });
                }
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Audit (GDPR/KVKK)
        if (pathname === "/api/audit") {
            try {
                Audit.initialize();
                const stats = Audit.getStats();
                const entries = Audit.query({ limit: 100 });
                serveJson(res, 200, { success: true, data: { stats, entries } });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Audit Erase (GDPR/KVKK Right to Erasure)
        if (pathname === "/api/audit/erase" && method === "POST") {
            try {
                Audit.initialize();
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", () => {
                    try {
                        const parsed = JSON.parse(body);
                        const confirmation = parsed.confirmationCode || "";
                        const changes = Audit.clearAll(confirmation);
                        serveJson(res, 200, { success: true, message: `${changes} records cleared under KVKK/GDPR right to erasure.` });
                    } catch (err) { serveJson(res, 400, { success: false, error: (err as Error).message }); }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Compliance
        if (pathname === "/api/compliance") {
            try {
                const { scanProjectCompliance } = await import("../cli/utils/compliance.js");
                const targetPath = params.path || "src";
                const scanPath = path.join(PROJECT_ROOT, targetPath);
                const rawIssues = scanProjectCompliance(scanPath);
                const violations = rawIssues.map(issue => {
                    const ruleLower = issue.rule.toLowerCase();
                    const type = ruleLower.includes("any") ? "any-type" : ruleLower.includes("console") ? "console-log" : "other";
                    return { file: path.relative(PROJECT_ROOT, issue.file), line: issue.line, type, message: issue.rule.replace(/^\[ERROR\]\s*Corporate\s*Compliance\s*Breach:\s*/i, "") };
                });
                const violatingFiles = new Set(violations.map(v => v.file));
                serveJson(res, 200, {
                    success: true, data: {
                        summary: { totalFiles: violatingFiles.size, totalViolations: violations.length, byType: { "any-type": violations.filter(v => v.type === "any-type").length, "console-log": violations.filter(v => v.type === "console-log").length } },
                        violations
                    }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Quality
        if (pathname === "/api/quality") {
            try {
                const { analyzePathQuality } = await import("../cli/utils/quality.js");
                const targetPath = params.path || "src";
                const result = analyzePathQuality(PROJECT_ROOT, targetPath);
                serveJson(res, 200, {
                    success: true, data: {
                        totalFiles: result.totalFiles, totalIssues: result.totalIssues,
                        longFunctions: result.longFunctions, deepNesting: result.deepNesting,
                        anyTypes: result.anyTypes, issues: result.issues.slice(0, 50),
                    }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── Knowledge Base API ────────────────────────────────────────
        // ─── Knowledge Base API ────────────────────────────────────────
        if (pathname === "/api/knowledge" && req.method === "GET") {
            try {
                const { Storage } = await import("../shared/storage.js");
                const list = Storage.getKnowledgeList();
                serveJson(res, 200, { success: true, data: list });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        if (pathname === "/api/knowledge/view" && req.method === "GET") {
            try {
                const file = params.file;
                if (!file) {
                    serveJson(res, 400, { success: false, error: "Missing 'file' parameter" });
                    return;
                }
                const { Storage } = await import("../shared/storage.js");
                const doc = Storage.getKnowledgeFile(file);
                if (!doc) {
                    serveJson(res, 404, { success: false, error: "File not found" });
                    return;
                }
                serveJson(res, 200, { success: true, data: doc });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        if (pathname === "/api/knowledge/update" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const file = parsed.file;
                        const content = parsed.content;
                        if (!file || content === undefined) {
                            serveJson(res, 400, { success: false, error: "Missing 'file' or 'content' in request body" });
                            return;
                        }
                        let safeFile = path.basename(file);
                        if (!safeFile.endsWith(".md")) {
                            safeFile += ".md";
                        }
                        const { Storage } = await import("../shared/storage.js");
                        Storage.saveKnowledgeFile(safeFile, content);
                        serveJson(res, 200, { success: true, message: `Knowledge document '${safeFile}' updated successfully.` });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        if (pathname === "/api/knowledge/delete" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const file = parsed.file;
                        if (!file) {
                            serveJson(res, 400, { success: false, error: "Missing 'file' in request body" });
                            return;
                        }
                        const safeFile = path.basename(file);
                        const { Storage } = await import("../shared/storage.js");
                        Storage.deleteKnowledgeFile(safeFile);
                        serveJson(res, 200, { success: true, message: `Knowledge document '${safeFile}' deleted.` });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Constitution API ─────────────────────────────────────────
        if (pathname === "/api/constitution" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const db = AtabeyStorage.getDB();
                const sections = db.prepare("SELECT * FROM constitution ORDER BY priority DESC").all();
                serveJson(res, 200, { success: true, data: sections });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        if (pathname === "/api/constitution/update" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { section, title, content } = parsed;
                        if (!section || !content) {
                            serveJson(res, 400, { success: false, error: "Missing 'section' or 'content'" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        const db = AtabeyStorage.getDB();
                        db.prepare(`
                            INSERT INTO constitution (section, title, content, updated_at)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(section) DO UPDATE SET
                                title = excluded.title,
                                content = excluded.content,
                                updated_at = excluded.updated_at
                        `).run(section, title || "", content, new Date().toISOString());
                        serveJson(res, 200, { success: true, message: `Section '${section}' updated.` });
                    } catch (err) { serveJson(res, 400, { success: false, error: (err as Error).message }); }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── CLI Commands API ─────────────────────────────────────────
        if (pathname === "/api/cli-commands" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const db = AtabeyStorage.getDB();
                const commands = db.prepare("SELECT * FROM cli_commands ORDER BY command").all();
                serveJson(res, 200, { success: true, data: commands });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── Prompts API ──────────────────────────────────────────────
        if (pathname === "/api/prompts" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const db = AtabeyStorage.getDB();
                const prompts = db.prepare("SELECT * FROM prompts ORDER BY category, name").all();
                serveJson(res, 200, { success: true, data: prompts });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        if (pathname === "/api/prompts/update" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name, category, content } = parsed;
                        if (!name || !content) {
                            serveJson(res, 400, { success: false, error: "Missing 'name' or 'content'" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        const db = AtabeyStorage.getDB();
                        db.prepare(`
                            INSERT INTO prompts (name, category, content, updated_at)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(name) DO UPDATE SET
                                category = excluded.category,
                                content = excluded.content,
                                updated_at = excluded.updated_at
                        `).run(name, category || "general", content, new Date().toISOString());
                        serveJson(res, 200, { success: true, message: `Prompt '${name}' updated.` });
                    } catch (err) { serveJson(res, 400, { success: false, error: (err as Error).message }); }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── Rules API ────────────────────────────────────────────────
        if (pathname === "/api/rules" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const db = AtabeyStorage.getDB();
                const rules = db.prepare("SELECT * FROM rules ORDER BY name").all();
                serveJson(res, 200, { success: true, data: rules });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        if (pathname === "/api/rules/update" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name, content, enabled } = parsed;
                        if (!name) {
                            serveJson(res, 400, { success: false, error: "Missing 'name'" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        const db = AtabeyStorage.getDB();
                        db.prepare(`
                            INSERT INTO rules (name, content, enabled, updated_at)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(name) DO UPDATE SET
                                content = excluded.content,
                                enabled = excluded.enabled,
                                updated_at = excluded.updated_at
                        `).run(name, content || "", enabled !== undefined ? (enabled ? 1 : 0) : 1, new Date().toISOString());
                        serveJson(res, 200, { success: true, message: `Rule '${name}' updated.` });
                    } catch (err) { serveJson(res, 400, { success: false, error: (err as Error).message }); }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── Registry API ─────────────────────────────────────────────
        if (pathname === "/api/registry" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const db = AtabeyStorage.getDB();
                const items = db.prepare("SELECT * FROM registry ORDER BY type, name").all();
                serveJson(res, 200, { success: true, data: items });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        if (pathname === "/api/registry/update" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name, type, data } = parsed;
                        if (!name) {
                            serveJson(res, 400, { success: false, error: "Missing 'name'" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        const db = AtabeyStorage.getDB();
                        db.prepare(`
                            INSERT INTO registry (name, type, data, updated_at)
                            VALUES (?, ?, ?, ?)
                            ON CONFLICT(name) DO UPDATE SET
                                type = excluded.type,
                                data = excluded.data,
                                updated_at = excluded.updated_at
                        `).run(name, type || "agent", data || "{}", new Date().toISOString());
                        serveJson(res, 200, { success: true, message: `Registry '${name}' updated.` });
                    } catch (err) { serveJson(res, 400, { success: false, error: (err as Error).message }); }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── Settings API (from config.json / metadata) ──────────────
        if (pathname === "/api/settings" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const projectPath = AtabeyStorage.getMetadata("projectPath") || "";
                const activeProvider = AtabeyStorage.getMetadata("activeProvider") || "gemini";
                serveJson(res, 200, { success: true, data: { projectPath, activeProvider } });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        if (pathname === "/api/settings" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        if (parsed.projectPath !== undefined) AtabeyStorage.setMetadata("projectPath", parsed.projectPath);
                        if (parsed.activeProvider !== undefined) AtabeyStorage.setMetadata("activeProvider", parsed.activeProvider);
                        serveJson(res, 200, { success: true, message: "Settings saved." });
                    } catch (err) { serveJson(res, 400, { success: false, error: (err as Error).message }); }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // ─── Config (project config from .atabey/config.json) ──────
        if (pathname === "/api/config" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const db = AtabeyStorage.getDB();
                const configs = db.prepare("SELECT * FROM metadata WHERE key LIKE 'config.%'").all() as Array<{ key: string; value: string }>;
                const config: Record<string, string> = {};
                for (const c of configs) {
                    config[c.key.replace("config.", "")] = c.value;
                }
                serveJson(res, 200, { success: true, data: config });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Adapter Skills
        if (pathname === "/api/adapters/skills") {
            try {
                const { ADAPTER_SKILLS } = await import("../../modules/skills/adapter-skills.js");
                const summary = Object.entries(ADAPTER_SKILLS).map(([id, config]) => ({
                    id, skillCount: Object.keys(config.enabledSkills).length,
                    toolsCount: config.toolMapping ? Object.keys(config.toolMapping).length : 0,
                    skills: Object.entries(config.enabledSkills).map(([skId, skVal]) => ({
                        id: skId,
                        name: skVal.name,
                        disabled: !!skVal.disabled
                    })),
                }));
                serveJson(res, 200, { success: true, data: summary });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // POST User Login
        if (pathname === "/api/auth/login" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { username, token } = parsed;
                        if (!username || !token) {
                            serveJson(res, 400, { success: false, error: "Username and token are required" });
                            return;
                        }

                        process.stderr.write(`[LOGIN ATTEMPT] username="${username}", token="${token}"\n`);
                        const { authenticateToken } = await import("./utils/auth.js");
                        const result = authenticateToken(token);
                        process.stderr.write(`[LOGIN RESULT] authenticated=${result.authenticated}, user="${result.user}"\n`);

                        if (result.authenticated && (result.user === username || (result.user === "admin" && username === "admin"))) {
                            serveJson(res, 200, { success: true, user: { name: username, role: result.user === "admin" ? "admin" : "user" } });
                        } else {
                            serveJson(res, 401, { success: false, error: "Invalid username or token" });
                        }
                    } catch (err) {
                        process.stderr.write(`[LOGIN ERROR] ${(err as Error).message}\n`);
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GET Configured Admin Users
        if (pathname === "/api/admin/users" && req.method === "GET") {
            try {
                const { AtabeyStorage } = await import("../shared/storage.js");
                const users = AtabeyStorage.getUsers();
                serveJson(res, 200, { success: true, data: users });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // POST Create/Update Admin User
        if (pathname === "/api/admin/users/create" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name, token, role } = parsed;
                        if (!name || !token) {
                            serveJson(res, 400, { success: false, error: "Username and token are required" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        AtabeyStorage.createUser(name.trim(), token.trim(), role || "user");
                        serveJson(res, 200, { success: true, message: `User ${name} created/updated successfully.` });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // POST Delete Admin User
        if (pathname === "/api/admin/users/delete" && req.method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { name } = parsed;
                        if (!name) {
                            serveJson(res, 400, { success: false, error: "Username is required" });
                            return;
                        }
                        const { AtabeyStorage } = await import("../shared/storage.js");
                        AtabeyStorage.deleteUser(name);
                        serveJson(res, 200, { success: true, message: `User ${name} deleted.` });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        if (pathname === "/api/adapters/skills/toggle" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { adapterId, skillId } = parsed;
                        if (!adapterId || !skillId) {
                            serveJson(res, 400, { success: false, error: "Missing adapterId or skillId" });
                            return;
                        }
                        const { ADAPTER_SKILLS } = await import("atabey/src/modules/skills/adapter-skills.js");
                        const adapter = ADAPTER_SKILLS[adapterId as import("atabey/src/modules/providers/types.js").AdapterId];
                        if (!adapter || !adapter.enabledSkills[skillId]) {
                            serveJson(res, 404, { success: false, error: "Adapter or skill not found" });
                            return;
                        }
                        const skill = adapter.enabledSkills[skillId];
                        skill.disabled = !skill.disabled;
                        serveJson(res, 200, { success: true, disabled: !!skill.disabled });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Workspace API ────────────────────────────────────────────
        if (pathname === "/api/workspace" && method === "GET") {
            try {
                const { WorkspaceManager } = await import("./utils/workspace.js");
                WorkspaceManager.initialize(PROJECT_ROOT);
                const workspaces = WorkspaceManager.listWorkspaces();
                const stats = WorkspaceManager.getStats();
                serveJson(res, 200, { success: true, data: { workspaces, stats } });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        if (pathname === "/api/workspace/setup" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { userName } = parsed;
                        if (!userName) {
                            serveJson(res, 400, { success: false, error: "userName required" });
                            return;
                        }
                        const { WorkspaceManager } = await import("./utils/workspace.js");
                        const { ClientConfigGenerator } = await import("./utils/client-config.js");
                        WorkspaceManager.initialize(PROJECT_ROOT);
                        const workspace = await WorkspaceManager.getOrCreateWorkspace(userName);

                        // Generate a unique token for this user if not already set
                        const userToken = process.env[`MCP_TOKEN_${workspace.developerId.toUpperCase()}`] ||
                            `atabey_${workspace.developerId}_${Date.now().toString(36)}`;

                        const guide = ClientConfigGenerator.generateSetupGuide(
                            PROJECT_ROOT, userName, userToken, HOST, PORT
                        );

                        serveJson(res, 200, {
                            success: true,
                            data: {
                                workspace,
                                userToken,
                                setupGuide: guide,
                                configs: ClientConfigGenerator.generateAll(PROJECT_ROOT, userName, userToken, HOST, PORT)
                                    .map(c => ({ clientType: c.clientType, configPath: c.configPath }))
                            }
                        });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // MCP Sessions (with user identity)
        if (pathname === "/api/mcp/sessions") {
            const sessionList = Array.from(sessions.entries()).map(([id, session]) => ({
                id,
                user: session.user,
                clientName: session.clientName,
                connectedAt: session.connectedAt,
                lastActivity: session.lastActivity,
                toolCalls: session.toolCalls,
            }));
            serveJson(res, 200, { success: true, data: { total: sessions.size, sessions: sessionList } });
            return;
        }

        // Discipline Stats
        if (pathname === "/api/discipline") {
            try {
                const { getAllDisciplineStats } = await import("./utils/discipline.js");
                const stats = getAllDisciplineStats();
                serveJson(res, 200, { success: true, data: stats });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Token Economy / Metrics
        if (pathname === "/api/metrics") {
            try {
                const metricsPath = path.join(FRAMEWORK_DIR, "observability/metrics.json");
                let entries: Array<{ timestamp: string; agent: string; action: string; estimatedTokens: number; error?: string }> = [];
                if (fs.existsSync(metricsPath)) {
                    entries = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
                }
                const byAgent: Record<string, { calls: number; tokens: number; cost: number }> = {};
                const byAction: Record<string, { calls: number; tokens: number }> = {};
                let totalTokens = 0;
                for (const entry of entries) {
                    const agent = entry.agent || "unknown";
                    const action = entry.action || "unknown";
                    const tokens = entry.estimatedTokens || 0;
                    if (!byAgent[agent]) byAgent[agent] = { calls: 0, tokens: 0, cost: 0 };
                    byAgent[agent].calls++;
                    byAgent[agent].tokens += tokens;
                    byAgent[agent].cost = +(byAgent[agent].tokens / 1000 * 0.003).toFixed(4);
                    if (!byAction[action]) byAction[action] = { calls: 0, tokens: 0 };
                    byAction[action].calls++;
                    byAction[action].tokens += tokens;
                    totalTokens += tokens;
                }
                serveJson(res, 200, {
                    success: true, data: {
                        totalToolCalls: entries.length, totalEstimatedTokens: totalTokens,
                        totalEstimatedCost: +(totalTokens / 1000 * 0.003).toFixed(4),
                        mcpSessions: sessions.size, byAgent, byAction, recentEntries: entries.slice(-100),
                    }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Telemetry Status
        if (pathname === "/api/telemetry") {
            try {
                const { telemetryStreamer, TelemetryConfig } = await import("./utils/telemetry-streamer.js");
                const status = telemetryStreamer.getStatus();
                serveJson(res, 200, { success: true, data: { ...status, config: { ...TelemetryConfig, AUTH_TOKEN: TelemetryConfig.AUTH_TOKEN ? "***" : "" } } });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Loop Detection Stats
        if (pathname === "/api/loop-detector") {
            try {
                const { getAllLoopStats } = await import("./utils/loop-detector.js");
                const agent = params.agent;
                const stats = agent
                    ? (await import("./utils/loop-detector.js")).getLoopStats(agent)
                    : getAllLoopStats();
                serveJson(res, 200, { success: true, data: stats });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Clear Loop Cooldown
        if (pathname.startsWith("/api/loop-detector/clear/") && method === "POST") {
            const agent = decodeURIComponent(pathname.replace("/api/loop-detector/clear/", ""));
            try {
                const { clearCooldown } = await import("./utils/loop-detector.js");
                const cleared = clearCooldown(agent);
                serveJson(res, 200, { success: true, data: { agent, cleared } });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // GET Settings
        if (pathname === "/api/settings" && method === "GET") {
            try {
                const { loadWebConfig } = await import("./utils/web-config.js");
                const config = loadWebConfig();
                const safeConfig = {
                    projectPath: config.projectPath,
                    activeProvider: config.activeProvider,
                    geminiApiKey: config.geminiApiKey ? "********" : "",
                    anthropicApiKey: config.anthropicApiKey ? "********" : "",
                    openaiApiKey: config.openaiApiKey ? "********" : "",
                };
                serveJson(res, 200, { success: true, data: safeConfig });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // POST Settings
        if (pathname === "/api/settings" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { saveWebConfig } = await import("./utils/web-config.js");

                        const configToSave: Record<string, string> = {};
                        if (parsed.projectPath) configToSave.projectPath = parsed.projectPath;
                        if (parsed.activeProvider) configToSave.activeProvider = parsed.activeProvider;
                        if (parsed.geminiApiKey && parsed.geminiApiKey !== "********") configToSave.geminiApiKey = parsed.geminiApiKey;
                        if (parsed.anthropicApiKey && parsed.anthropicApiKey !== "********") configToSave.anthropicApiKey = parsed.anthropicApiKey;
                        if (parsed.openaiApiKey && parsed.openaiApiKey !== "********") configToSave.openaiApiKey = parsed.openaiApiKey;

                        const saved = saveWebConfig(configToSave);
                        serveJson(res, 200, { success: true, message: "Settings saved successfully", projectPath: saved.projectPath });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // POST Dispatch Task (Chat & Agent Selection)
        if (pathname === "/api/chat/dispatch" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { projectPath, agent, message } = parsed;

                        if (!projectPath || !agent || !message) {
                            serveJson(res, 400, { success: false, error: "projectPath, agent, and message are required." });
                            return;
                        }

                        // 1. Save Project Path setting
                        const { saveWebConfig, startOrchestratorLoop } = await import("./utils/web-config.js");
                        saveWebConfig({ projectPath });

                        // 2. Generate Trace ID
                        const { asAgentID, asTraceID } = await import("../shared/types.js");
                        const traceId = "T-" + Date.now().toString().slice(-6);

                        // 3. Save metadata phase and traceId
                        const { Storage } = await import("../shared/storage.js");
                        Storage.setMetadata("traceId", traceId);
                        Storage.setMetadata("phase", "PHASE_0");

                        // 4. Save Hermes message
                        const hermesMsg = {
                            timestamp: new Date().toISOString(),
                            from: asAgentID("web-user"),
                            to: asAgentID(agent),
                            category: "DELEGATION" as const,
                            content: message,
                            traceId: asTraceID(traceId),
                            status: "PENDING" as const,
                            priority: "HIGH" as const,
                            requiresApproval: false
                        };
                        Storage.saveMessage(hermesMsg);

                        // 5. Broadcast via WebSocket
                        broadcastWS("message", hermesMsg);
                        broadcastWS("log", {
                            timestamp: new Date().toISOString(),
                            agent: "web-user",
                            action: "DISPATCH",
                            trace_id: traceId,
                            status: "SUCCESS",
                            summary: `Dispatched task to ${agent}: ${message.substring(0, 50)}...`
                        });

                        // 6. Start orchestrator loop asynchronously
                        const runResult = startOrchestratorLoop();

                        serveJson(res, 200, {
                            success: true,
                            traceId,
                            message: `Task dispatched to ${agent}. ${runResult.message}`
                        });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GET Browse Directories for Folder Selection
        if (pathname === "/api/project/browse-dirs" && method === "GET") {
            try {
                const fs = await import("fs");
                const path = await import("path");
                const os = await import("os");

                let target = params.path ? String(params.path) : "";
                if (!target) {
                    const { loadWebConfig } = await import("./utils/web-config.js");
                    target = loadWebConfig().projectPath || os.homedir();
                }

                target = path.resolve(target);

                if (!fs.existsSync(target)) {
                    serveJson(res, 404, { success: false, error: "Path not found" });
                    return;
                }

                const stats = fs.statSync(target);
                if (!stats.isDirectory()) {
                    serveJson(res, 400, { success: false, error: "Not a directory" });
                    return;
                }

                const files = fs.readdirSync(target);
                const dirs: { name: string; path: string }[] = [];

                for (const file of files) {
                    if (file.startsWith(".")) continue; // skip hidden
                    try {
                        const fullPath = path.join(target, file);
                        const isDir = fs.statSync(fullPath).isDirectory();
                        if (isDir) {
                            dirs.push({ name: file, path: fullPath });
                        }
                    } catch {
                        // ignore unreadable
                    }
                }

                serveJson(res, 200, {
                    success: true,
                    currentPath: target,
                    parentPath: path.dirname(target) !== target ? path.dirname(target) : null,
                    dirs: dirs.sort((a, b) => a.name.localeCompare(b.name))
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GET Files List for Workspace Viewer
        if (pathname === "/api/project/files" && method === "GET") {
            try {
                const fs = await import("fs");
                const path = await import("path");
                const { loadWebConfig } = await import("./utils/web-config.js");

                const config = loadWebConfig();
                const projectDir = config.projectPath;

                const subDir = params.path ? String(params.path) : "";
                let targetDir = projectDir;

                if (subDir) {
                    targetDir = path.resolve(projectDir, subDir);
                    // Security check: ensure path is within projectPath
                    if (!targetDir.startsWith(projectDir)) {
                        serveJson(res, 403, { success: false, error: "Access denied" });
                        return;
                    }
                }

                if (!fs.existsSync(targetDir)) {
                    serveJson(res, 404, { success: false, error: "Project path not found" });
                    return;
                }

                const files = fs.readdirSync(targetDir);
                const items: { name: string; isDir: boolean; relativePath: string }[] = [];

                for (const file of files) {
                    if (file === "node_modules" || file === ".git" || file === ".DS_Store") continue;
                    try {
                        const fullPath = path.join(targetDir, file);
                        const stat = fs.statSync(fullPath);
                        items.push({
                            name: file,
                            isDir: stat.isDirectory(),
                            relativePath: path.relative(projectDir, fullPath)
                        });
                    } catch {
                        // ignore unreadable
                    }
                }

                serveJson(res, 200, {
                    success: true,
                    currentPath: projectDir,
                    relativePath: path.relative(projectDir, targetDir),
                    items: items.sort((a, b) => {
                        if (a.isDir && !b.isDir) return -1;
                        if (!a.isDir && b.isDir) return 1;
                        return a.name.localeCompare(b.name);
                    })
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GET File Content
        if (pathname === "/api/project/file-content" && method === "GET") {
            try {
                const fs = await import("fs");
                const path = await import("path");
                const { loadWebConfig } = await import("./utils/web-config.js");

                const config = loadWebConfig();
                const projectDir = config.projectPath;

                const filePath = params.path ? String(params.path) : "";
                if (!filePath) {
                    serveJson(res, 400, { success: false, error: "path parameter is required" });
                    return;
                }

                const absoluteFilePath = path.resolve(projectDir, filePath);
                // Security check: ensure path is within projectPath
                if (!absoluteFilePath.startsWith(projectDir)) {
                    serveJson(res, 403, { success: false, error: "Access denied" });
                    return;
                }

                if (!fs.existsSync(absoluteFilePath) || fs.statSync(absoluteFilePath).isDirectory()) {
                    serveJson(res, 404, { success: false, error: "File not found" });
                    return;
                }

                // Check file size (limit to 2MB to avoid memory crash)
                const size = fs.statSync(absoluteFilePath).size;
                if (size > 2 * 1024 * 1024) {
                    serveJson(res, 400, { success: false, error: "File is too large (max 2MB)" });
                    return;
                }

                const content = fs.readFileSync(absoluteFilePath, "utf8");
                serveJson(res, 200, {
                    success: true,
                    path: filePath,
                    content
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Orchestrator Status
        if (pathname === "/api/orchestrator/status" && method === "GET") {
            try {
                const { getOrchestratorState } = await import("./utils/web-config.js");
                serveJson(res, 200, { success: true, data: getOrchestratorState() });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Orchestrator Start
        if (pathname === "/api/orchestrator/start" && method === "POST") {
            try {
                const { startOrchestratorLoop } = await import("./utils/web-config.js");
                const result = startOrchestratorLoop();
                if (result.success) {
                    broadcastWS("orchestrator_state", { running: true });
                    serveJson(res, 200, { success: true, message: result.message });
                } else {
                    serveJson(res, 400, { success: false, error: result.message });
                }
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Orchestrator Stop
        if (pathname === "/api/orchestrator/stop" && method === "POST") {
            try {
                const { stopOrchestratorLoop } = await import("./utils/web-config.js");
                const result = stopOrchestratorLoop();
                if (result.success) {
                    broadcastWS("orchestrator_state", { running: false });
                    serveJson(res, 200, { success: true, message: result.message });
                } else {
                    serveJson(res, 400, { success: false, error: result.message });
                }
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GET Token Budget Config
        if (pathname === "/api/token-budget/config" && method === "GET") {
            try {
                const { getTokenBudgetConfig } = await import("./utils/context-optimizer.js");
                const config = getTokenBudgetConfig();
                serveJson(res, 200, { success: true, data: config });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // UPDATE Token Budget Config
        if (pathname === "/api/token-budget/config/update" && method === "POST") {
            try {
                let body = "";
                req.on("data", chunk => { body += chunk.toString(); });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body);
                        const { updateTokenBudgetConfig } = await import("./utils/context-optimizer.js");
                        updateTokenBudgetConfig(parsed);
                        serveJson(res, 200, { success: true, message: "Token budget configuration updated successfully." });
                    } catch (err) {
                        serveJson(res, 400, { success: false, error: (err as Error).message });
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // RESET Agent Token Budgets
        if (pathname === "/api/token-budget/reset" && method === "POST") {
            try {
                const { resetTokenBudgets } = await import("./utils/context-optimizer.js");
                resetTokenBudgets();
                serveJson(res, 200, { success: true, message: "All agent token budgets reset successfully." });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Budget / FinOps Status
        if (pathname === "/api/finops") {
            try {
                const { budgetManager } = await import("./utils/finops.js");
                const state = budgetManager.getState();
                serveJson(res, 200, { success: true, data: state });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Budget Check for an agent
        if (pathname === "/api/finops/check") {
            try {
                const agent = params.agent || "default";
                const { budgetManager } = await import("./utils/finops.js");
                const result = budgetManager.checkBudget(agent);
                serveJson(res, 200, { success: true, data: result });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Budget Reset
        if (pathname === "/api/finops/reset" && method === "POST") {
            try {
                const { budgetManager } = await import("./utils/finops.js");
                budgetManager.resetPeriod();
                serveJson(res, 200, { success: true, message: "Budget period reset." });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // License Scanner
        if (pathname === "/api/license") {
            try {
                const { scanForLicenses, getLicenseSeveritySummary, LicenseScannerConfig } = await import("./utils/license-scanner.js");
                const filePath = params.path || "";
                const content = params.content || "";
                const matches = filePath && content ? scanForLicenses(filePath, content) : [];
                const summary = matches.length > 0 ? getLicenseSeveritySummary(matches) : null;
                serveJson(res, 200, {
                    success: true, data: {
                        matches,
                        summary,
                        config: LicenseScannerConfig,
                    }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // Auto-Rollback Stats
        if (pathname === "/api/rollback") {
            try {
                const { AutoRollbackEngine } = await import("./utils/auto-rollback.js");
                const stats = AutoRollbackEngine.getSnapshotStats();
                serveJson(res, 200, { success: true, data: stats });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
        }

        // All Governance Stats (combined endpoint)
        if (pathname === "/api/governance") {
            try {
                const { getAllDisciplineStats } = await import("./utils/discipline.js");
                const { getAllTokenBudgetStats } = await import("./utils/context-optimizer.js");
                const { getAllLoopStats } = await import("./utils/loop-detector.js");
                const { getAllRules } = await import("./utils/rules-engine.js");
                const { AutoRollbackEngine } = await import("./utils/auto-rollback.js");
                const { budgetManager } = await import("./utils/finops.js");

                serveJson(res, 200, {
                    success: true, data: {
                        discipline: getAllDisciplineStats(),
                        tokenBudget: getAllTokenBudgetStats(),
                        loopDetection: getAllLoopStats(),
                        rules: getAllRules().map(r => ({ id: r.id, name: r.name, priority: r.priority, bypassable: r.bypassable })),
                        rollback: AutoRollbackEngine.getSnapshotStats(),
                        budget: budgetManager.getState(),
                        telemetry: (await import("./utils/telemetry-streamer.js")).telemetryStreamer.getStatus(),
                    }
                });
            } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
            return;
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
        Storage.onMessageSaved = undefined;
        Storage.onMessageStatusUpdated = undefined;
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
    const transportMode = process.env.MCP_TRANSPORT || "unified";

    process.on("uncaughtException", (error: Error) => {
        process.stderr.write(`[atabey-mcp] Uncaught exception: ${error.message}\n`);
    });
    process.on("unhandledRejection", (reason: unknown) => {
        const message = reason instanceof Error ? reason.message : String(reason);
        process.stderr.write(`[atabey-mcp] Unhandled rejection: ${message}\n`);
    });

    const shutdown = async () => {
        try { await server.close(); } catch { /* ignore */ }
        process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    if (transportMode === "stdio") {
        const transport = new StdioServerTransport();
        process.stderr.write("[atabey-mcp] Stdio mode (single client).\n");
        await server.connect(transport);
    } else {
        createUnifiedServer();
    }
}

run().catch((error: Error) => {
    process.stderr.write(`[atabey-mcp] Fatal startup error: ${error.message}\n`);
    process.exit(1);
});
