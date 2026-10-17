import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocket, WebSocketServer } from "ws";
import { assertTransportSecurity, createHttpOrHttpsServer, describeTls, resolveTlsConfig, tlsScheme, wsScheme } from "atabey-shared/tls.js";
import { Audit } from "../../shared/audit.js";
import { FRAMEWORK } from "../../shared/constants.js";
import { appendFile } from "../../shared/fs.js";
import { Storage } from "../../shared/storage.js";
import { asTraceID } from "../../shared/types.js";
import { scanProjectCompliance } from "../utils/compliance.js";
import { getFrameworkDir } from "../utils/memory.js";
import { getPackageRoot } from "../utils/pkg.js";
import { analyzePathQuality } from "../utils/quality.js";
import { UI } from "../utils/ui.js";

/**
 * Metric entry interface for token economy tracking.
 */
interface MetricEntry {
    timestamp: string;
    agent: string;
    action: string;
    estimatedTokens: number;
    error?: string;
}

/**
 * Resolve the dashboard version from the nearest package.json (walks up from
 * the compiled file) instead of a hardcoded, drift-prone string.
 */
function resolveDashboardVersion(): string {
    try {
        let dir = path.dirname(fileURLToPath(import.meta.url));
        for (let i = 0; i < 8; i++) {
            const candidate = path.join(dir, "package.json");
            if (fs.existsSync(candidate)) {
                const pkg = JSON.parse(fs.readFileSync(candidate, "utf8")) as { name?: string; version?: string };
                if (pkg.version && (pkg.name === "atabey" || pkg.name === "atabey-mcp")) return pkg.version;
            }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
        }
    } catch {
        /* fall through */
    }
    return "0.0.0";
}

const DASHBOARD_VERSION = resolveDashboardVersion();

/**
 * Serves a JSON response.
 */
function serveJson(res: http.ServerResponse, statusCode: number, data: unknown) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
}

/**
 * Serves a file with specific content type.
 */
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

/**
 * Parses the URL path and query parameters.
 */
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

/**
 * WebSocket clients store for real-time updates.
 */
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

/**
 * Safely reads and parses request JSON body up to 2MB.
 */
function parseJsonBody<T = Record<string, unknown>>(req: http.IncomingMessage, maxBytes = 2 * 1024 * 1024): Promise<T> {
    return new Promise((resolve, reject) => {
        let body = "";
        let bytesRead = 0;
        req.on("data", (chunk: Buffer | string) => {
            bytesRead += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.length;
            if (bytesRead > maxBytes) {
                req.destroy();
                reject(new Error("PAYLOAD_TOO_LARGE: Request exceeds 2MB limit"));
                return;
            }
            body += chunk.toString();
        });
        req.on("end", () => {
            try {
                resolve(body.trim() ? JSON.parse(body) : ({} as T));
            } catch (err) {
                reject(err);
            }
        });
        req.on("error", (err) => reject(err));
    });
}

/**
 * [SERVER] Hermes Visual Control Plane (Dashboard Server) — Extended
 * Serves the framework state as a JSON API and the bundled Web UI.
 */
export async function dashboardCommand(port: number = FRAMEWORK.DASHBOARD_PORT) {
    const frameworkDir = getFrameworkDir();
    const pkgRoot = getPackageRoot();
    const projectRoot = process.cwd();
    const possibleUiDistPaths = [
        path.join(pkgRoot, "../atabey-mcp/dashboard/dist"),
        path.join(pkgRoot, "../atabey-mcp/dist/dashboard"),
        path.join(pkgRoot, "../../packages/atabey-mcp/dashboard/dist"),
        path.join(pkgRoot, "../../packages/atabey-mcp/dist/dashboard"),
        path.join(process.cwd(), "packages/atabey-mcp/dashboard/dist"),
        path.join(process.cwd(), "packages/atabey-mcp/dist/dashboard"),
        path.join(process.cwd(), "atabey-mcp/dashboard/dist"),
        path.join(process.cwd(), "atabey-mcp/dist/dashboard"),
        path.join(process.cwd(), "node_modules/atabey-mcp/dashboard/dist"),
        path.join(process.cwd(), "node_modules/atabey-mcp/dist/dashboard"),
        path.join(pkgRoot, "node_modules/atabey-mcp/dashboard/dist"),
        path.join(pkgRoot, "node_modules/atabey-mcp/dist/dashboard"),
    ];
    const uiDistPath = possibleUiDistPaths.find(p => fs.existsSync(path.join(p, "index.html"))) || possibleUiDistPaths[0];

    const tls = resolveTlsConfig();

    const server = createHttpOrHttpsServer(tls, async (req, res) => {
        // CORS & Cache Headers
        const origin = req.headers.origin;
        const isLocalOrigin = !origin ||
            origin.startsWith("http://localhost:") ||
            origin.startsWith("http://127.0.0.1:") ||
            origin.startsWith("https://localhost:") ||
            origin.startsWith("https://127.0.0.1:") ||
            origin === "null";

        if (isLocalOrigin) {
            res.setHeader("Access-Control-Allow-Origin", origin || "*");
        } else if (process.env.ATABEY_ALLOWED_ORIGIN && origin === process.env.ATABEY_ALLOWED_ORIGIN) {
            res.setHeader("Access-Control-Allow-Origin", origin);
        }
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");

        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = req.url || "/";
        const { pathname, params } = parseUrl(url);

        // [SECURITY] Authentication check for API routes
        // Skip auth for static UI and health endpoints
        const needsAuth = pathname.startsWith("/api/");
        const isPublicPath = pathname === "/api/health";
        if (needsAuth && !isPublicPath) {
            try {
                const { authenticate } = await import("atabey-mcp/utils/auth.js");
                const auth = authenticate(req);
                if (!auth.authenticated) {
                    serveJson(res, 401, { error: "Unauthorized. Provide Authorization: Bearer <token> header. Set MCP_AUTH_TOKEN env var to configure." });
                    return;
                }
            } catch (e) {
                // FAIL-CLOSED: if we cannot verify auth, deny rather than serve.
                UI.warning(`[AUTH-WARNING] Auth module error: ${(e as Error).message}. Denying request (fail-closed).`);
                serveJson(res, 500, { error: "Authentication subsystem unavailable; request denied." });
                return;
            }
        }

        // ─── API Routes ────────────────────────────────────────────────

        // Health check
        if (pathname === "/api/health") {
            serveJson(res, 200, { status: "healthy", version: DASHBOARD_VERSION, frameworkDir });
            return;
        }

        // System status
        if (pathname === "/api/status") {
            const statusPath = path.join(frameworkDir, "memory", "status.json");
            serveFile(res, statusPath, "application/json");
            return;
        }

        // Project memory (Markdown)
        if (pathname === "/api/memory") {
            const memoryPath = path.join(frameworkDir, "memory", "PROJECT_MEMORY.md");
            serveFile(res, memoryPath, "text/markdown");
            return;
        }

        // Memory Search (Vector Embeddings)
        if (pathname === "/api/memory/search") {
            try {
                const query = params.q || "";
                const limit = parseInt(params.limit || "10", 10);

                if (!query) {
                    const db = Storage.getDB();
                    const rows = db.prepare("SELECT * FROM vector_memory ORDER BY created_at DESC LIMIT ?").all(limit) as Array<{
                        id: string;
                        content: string;
                        category: string;
                        metadata: string;
                        created_at: string;
                    }>;
                    const results = rows.map(row => {
                        const meta = JSON.parse(row.metadata || "{}");
                        return {
                            id: row.id,
                            content: row.content,
                            type: row.category || meta.category || "memory",
                            timestamp: meta.createdAt || row.created_at,
                            relevance: 1.0
                        };
                    });
                    serveJson(res, 200, { success: true, data: results });
                    return;
                }

                import("../../modules/memory/core.js").then(async ({ CoreMemory }) => {
                    const results = await CoreMemory.recall(query, { limit });
                    const flattened = results.map(r => ({
                        id: r.entry.id,
                        content: r.entry.content,
                        type: r.entry.metadata.category || "memory",
                        timestamp: r.entry.metadata.createdAt || new Date().toISOString(),
                        relevance: r.score
                    }));
                    serveJson(res, 200, { success: true, data: flattened });
                }).catch(e => {
                    serveJson(res, 500, { success: false, error: "Failed to load memory module: " + e.message });
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Agent & System Logs (SQLite)
        if (pathname.startsWith("/api/logs")) {
            try {
                const logs = Storage.getLogs();
                // Optionally filter by agent if /api/logs/:agent is requested
                const agent = pathname.split("/api/logs/")[1];
                const filteredLogs = agent ? logs.filter(l => l.agent === agent) : logs;
                serveJson(res, 200, { success: true, data: filteredLogs });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GDPR & KVKK Audit Logs (SQLite)
        if (pathname === "/api/audit") {
            try {
                Audit.initialize();
                const stats = Audit.getStats();
                const entries = Audit.query({ limit: 100 });
                serveJson(res, 200, { success: true, data: { stats, entries } });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // GDPR / KVKK Right to Erasure Request (Right to be Forgotten)
        if (pathname === "/api/audit/erase" && req.method === "POST") {
            try {
                Audit.initialize();
                const parsed = await parseJsonBody<{ confirmationCode?: string }>(req);
                const confirmation = parsed.confirmationCode || "";
                const changes = Audit.clearAll(confirmation);
                serveJson(res, 200, { success: true, message: `${changes} records cleared under GDPR Art. 17 / KVKK Art. 7 right to erasure.` });
            } catch (err) {
                serveJson(res, 400, { success: false, error: (err as Error).message });
            }
            return;
        }

        // ─── Messages API ──────────────────────────────────────────────
        if (pathname === "/api/messages") {
            try {
                const messages = Storage.getPendingMessages();
                serveJson(res, 200, { success: true, data: messages });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Tasks API ─────────────────────────────────────────────────
        if (pathname === "/api/tasks") {
            try {
                const traceId = params.traceId ? asTraceID(params.traceId) : undefined;
                const tasks = Storage.getTasks(traceId);
                serveJson(res, 200, { success: true, data: tasks });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Agents API ────────────────────────────────────────────────
        if (pathname === "/api/agents") {
            try {
                const agents = Storage.getAllAgents();
                serveJson(res, 200, { success: true, data: agents });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Approvals GET API ──────────────────────────────────────────
        if (pathname === "/api/approvals") {
            try {
                const allMessages = Storage.getPendingMessages();
                const approvals = allMessages.filter(
                    m => m.category === "ALERT" || m.category === "ACTION"
                ).map(m => ({
                    id: String(m.id || m.traceId),
                    traceId: m.traceId,
                    description: m.content ? (typeof m.content === "string" ? m.content : JSON.stringify(m.content)) : "Approval required",
                    status: m.status || "PENDING",
                    timestamp: m.timestamp || new Date().toISOString()
                }));
                serveJson(res, 200, { success: true, data: approvals });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── FinOps API ────────────────────────────────────────────────
        if (pathname === "/api/finops" && req.method === "GET") {
            try {
                const { FinOpsManager } = await import("atabey-mcp/utils/finops.js");
                const state = FinOpsManager.getBudgetState();
                serveJson(res, 200, { success: true, data: state });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        if (pathname === "/api/finops/daily" && req.method === "GET") {
            try {
                const { FinOpsManager } = await import("atabey-mcp/utils/finops.js");
                const days = parseInt(params.days || "7", 10) || 7;
                const history = FinOpsManager.getDailyTokenHistory(days);
                serveJson(res, 200, { success: true, data: history });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        if (pathname === "/api/finops/reset" && req.method === "POST") {
            try {
                const { FinOpsManager } = await import("atabey-mcp/utils/finops.js");
                FinOpsManager.resetBudgetPeriod();
                serveJson(res, 200, { success: true, message: "Budget period reset successfully." });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Approval API ──────────────────────────────────────────────
        if (pathname.startsWith("/api/approve/") && req.method === "POST") {
            const traceId = pathname.replace("/api/approve/", "");
            if (!traceId) {
                serveJson(res, 400, { success: false, error: "Trace ID is required" });
                return;
            }
            try {
                let approvedCount = 0;

                // 1. Primary: Update SQLite approvals table
                try {
                    const approval = Storage.getApproval(traceId);
                    if (approval && approval.status === "PENDING") {
                        Storage.updateApprovalStatus(traceId, "APPROVED");
                        approvedCount++;
                    }
                } catch { /* best effort */ }

                // 2. Update SQLite pending messages
                const pendingMessages = Storage.getPendingMessages().filter(
                    m => m.traceId === traceId && (m.category === "ALERT" || m.category === "ACTION")
                );
                pendingMessages.forEach((msg) => {
                    if (msg.id !== undefined) {
                        Storage.updateMessageStatus(msg.id, "APPROVED");
                        approvedCount++;
                    }
                });

                // 3. Fallback: Update legacy file-based message queue
                const messagesDir = path.join(frameworkDir, "messages");
                if (fs.existsSync(messagesDir)) {
                    const files = fs.readdirSync(messagesDir);
                    for (const file of files) {
                        if (file.endsWith(".json")) {
                            const p = path.join(messagesDir, file);
                            try {
                                const data = JSON.parse(fs.readFileSync(p, "utf8"));
                                if (data.traceId === traceId && (data.category === "ALERT" || data.category === "ACTION") && data.status !== "APPROVED") {
                                    data.status = "APPROVED";
                                    data.resolvedAt = new Date().toISOString();
                                    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
                                    approvedCount++;
                                }
                            } catch { /* ignore */ }
                        }
                    }
                }

                if (approvedCount === 0) {
                    serveJson(res, 404, { success: false, error: "No pending approval found for this trace ID" });
                    return;
                }

                // Log approval to audit — atomic appendFile kullan
                const auditPath = path.join(frameworkDir, "observability/audit_log.md");
                if (fs.existsSync(auditPath)) {
                    const logEntry = "\n- **[" + new Date().toISOString() + "]** USER -> @manager | APPROVED | Trace: " + traceId;
                    appendFile(auditPath, logEntry);
                }

                // Notify WS clients
                broadcastWS("approval", { traceId, status: "APPROVED" });

                serveJson(res, 200, { success: true, message: `Trace ${traceId} approved successfully`, approved: approvedCount });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Rejection API ─────────────────────────────────────────────
        if (pathname.startsWith("/api/reject/") && req.method === "POST") {
            const traceId = pathname.replace("/api/reject/", "");
            if (!traceId) {
                serveJson(res, 400, { success: false, error: "Trace ID is required" });
                return;
            }
            try {
                let rejectedCount = 0;

                // 1. Primary: Update SQLite approvals table
                try {
                    const approval = Storage.getApproval(traceId);
                    if (approval && approval.status === "PENDING") {
                        Storage.updateApprovalStatus(traceId, "REJECTED");
                        rejectedCount++;
                    }
                } catch { /* best effort */ }

                // 2. Update SQLite pending messages
                const pendingMessages = Storage.getPendingMessages().filter(
                    m => m.traceId === traceId && (m.category === "ALERT" || m.category === "ACTION")
                );
                pendingMessages.forEach((msg) => {
                    if (msg.id !== undefined) {
                        Storage.updateMessageStatus(msg.id, "REJECTED");
                        rejectedCount++;
                    }
                });

                // 3. Fallback: Update legacy file-based message queue
                const messagesDir = path.join(frameworkDir, "messages");
                if (fs.existsSync(messagesDir)) {
                    const files = fs.readdirSync(messagesDir);
                    for (const file of files) {
                        if (file.endsWith(".json")) {
                            const p = path.join(messagesDir, file);
                            try {
                                const data = JSON.parse(fs.readFileSync(p, "utf8"));
                                if (data.traceId === traceId && (data.category === "ALERT" || data.category === "ACTION") && data.status !== "REJECTED") {
                                    data.status = "REJECTED";
                                    data.resolvedAt = new Date().toISOString();
                                    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
                                    rejectedCount++;
                                }
                            } catch { /* ignore */ }
                        }
                    }
                }

                if (rejectedCount === 0) {
                    serveJson(res, 404, { success: false, error: "No pending approval found for this trace ID" });
                    return;
                }

                // Log rejection to audit
                const auditPath = path.join(frameworkDir, "observability/audit_log.md");
                if (fs.existsSync(auditPath)) {
                    const logEntry = "\n- **[" + new Date().toISOString() + "]** USER -> @manager | REJECTED | Trace: " + traceId;
                    appendFile(auditPath, logEntry);
                }

                // Notify WS clients
                broadcastWS("approval", { traceId, status: "REJECTED" });

                serveJson(res, 200, { success: true, message: `Trace ${traceId} rejected successfully`, rejected: rejectedCount });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Hermes Message Queue Stats ────────────────────────────────
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
                    success: true,
                    data: {
                        total: totalMessages.count,
                        pending: messages.length,
                        byCategory,
                        byStatus,
                        lastMessage: messages.length > 0 ? messages[messages.length - 1] : null,
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Code Quality API ──────────────────────────────────────────
        if (pathname === "/api/quality") {
            try {
                const targetPath = params.path || "src";
                const result = analyzePathQuality(projectRoot, targetPath);

                serveJson(res, 200, {
                    success: true,
                    data: {
                        totalFiles: result.totalFiles,
                        totalIssues: result.totalIssues,
                        longFunctions: result.longFunctions,
                        deepNesting: result.deepNesting,
                        anyTypes: result.anyTypes,
                        issues: result.issues.slice(0, 50),
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Adapter-Skills API ─────────────────────────────────────────
        if (pathname === "/api/adapters/skills") {
            import("../../modules/skills/adapter-skills.js")
                .then(({ ADAPTER_SKILLS }) => {
                    const summary = Object.entries(ADAPTER_SKILLS).map(([id, config]) => ({
                        id,
                        skillCount: Object.keys(config.enabledSkills).length,
                        toolsCount: config.toolMapping ? Object.keys(config.toolMapping).length : 0,
                        skills: Object.keys(config.enabledSkills),
                    }));
                    serveJson(res, 200, { success: true, data: summary });
                })
                .catch((e: Error) => {
                    serveJson(res, 500, { success: false, error: e.message });
                });
            return;
        }

        // ─── Compliance API ────────────────────────────────────────────
        if (pathname === "/api/compliance") {
            try {
                const targetPath = params.path || "src";
                const scanPath = path.join(projectRoot, targetPath);

                // Use the core AST-based scanner to find violations
                const rawIssues = scanProjectCompliance(scanPath);

                const violations = rawIssues.map(issue => {
                    const ruleLower = issue.rule.toLowerCase();
                    const type = ruleLower.includes("any") ? "any-type"
                        : ruleLower.includes("console") ? "console-log"
                            : "other";

                    return {
                        file: path.relative(projectRoot, issue.file),
                        line: issue.line,
                        type,
                        message: issue.rule.replace(/^\[ERROR\]\s*Corporate\s*Compliance\s*Breach:\s*/i, "")
                    };
                });

                const violatingFiles = new Set(violations.map(v => v.file));

                const summary = {
                    totalFiles: violatingFiles.size,
                    totalViolations: violations.length,
                    byType: {
                        "any-type": violations.filter((v) => v.type === "any-type").length,
                        "console-log": violations.filter((v) => v.type === "console-log").length,
                    },
                };

                serveJson(res, 200, { success: true, data: { summary, violations } });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // MCP Sessions
        if (pathname === "/api/mcp/sessions") {
            serveJson(res, 200, { success: true, data: { total: 0, sessions: [] } });
            return;
        }

        // Discipline Stats
        if (pathname === "/api/discipline") {
            try {
                const { getAllDisciplineStats } = await import("atabey-mcp/utils/discipline.js");
                const stats = getAllDisciplineStats();
                serveJson(res, 200, { success: true, data: stats });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Telemetry Status
        if (pathname === "/api/telemetry") {
            try {
                const { telemetryStreamer, TelemetryConfig } = await import("atabey-mcp/utils/telemetry-streamer.js");
                const status = telemetryStreamer.getStatus();
                serveJson(res, 200, { success: true, data: { ...status, config: { ...TelemetryConfig, AUTH_TOKEN: TelemetryConfig.AUTH_TOKEN ? "***" : "" } } });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Loop Detection Stats
        if (pathname === "/api/loop-detector") {
            try {
                const { getAllLoopStats } = await import("atabey-mcp/utils/loop-detector.js");
                const agent = params.agent;
                const stats = agent
                    ? (await import("atabey-mcp/utils/loop-detector.js")).getLoopStats(agent)
                    : getAllLoopStats();
                serveJson(res, 200, { success: true, data: stats });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // Clear Loop Cooldown
        if (pathname.startsWith("/api/loop-detector/clear/") && req.method === "POST") {
            const agent = decodeURIComponent(pathname.replace("/api/loop-detector/clear/", ""));
            try {
                const { clearCooldown } = await import("atabey-mcp/utils/loop-detector.js");
                const cleared = clearCooldown(agent);
                serveJson(res, 200, { success: true, data: { agent, cleared } });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }


        // Auto-Rollback Stats
        if (pathname === "/api/rollback") {
            try {
                const { AutoRollbackEngine } = await import("atabey-mcp/utils/auto-rollback.js");
                const stats = AutoRollbackEngine.getSnapshotStats();
                serveJson(res, 200, { success: true, data: stats });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // All Governance Stats (combined endpoint)
        if (pathname === "/api/governance") {
            try {
                const { getAllDisciplineStats } = await import("atabey-mcp/utils/discipline.js");
                const { getAllTokenBudgetStats } = await import("atabey-mcp/utils/context-optimizer.js");
                const { getAllLoopStats } = await import("atabey-mcp/utils/loop-detector.js");
                const { getAllRules } = await import("atabey-mcp/utils/rules-engine.js");
                const { AutoRollbackEngine } = await import("atabey-mcp/utils/auto-rollback.js");
                serveJson(res, 200, {
                    success: true, data: {
                        discipline: getAllDisciplineStats(),
                        tokenBudget: getAllTokenBudgetStats(),
                        loopDetection: getAllLoopStats(),
                        rules: getAllRules().map(r => ({ id: r.id, name: r.name, priority: r.priority, bypassable: r.bypassable })),
                        rollback: AutoRollbackEngine.getSnapshotStats(),
                        telemetry: (await import("atabey-mcp/utils/telemetry-streamer.js")).telemetryStreamer.getStatus(),
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── Token Economy / Metrics API ────────────────────────────────
        if (pathname === "/api/metrics") {
            try {
                const frameworkDir = getFrameworkDir();
                const metricsPath = path.join(projectRoot, frameworkDir, "observability/metrics.json");
                let entries: MetricEntry[] = [];
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
                    success: true,
                    data: {
                        totalToolCalls: entries.length,
                        totalEstimatedTokens: totalTokens,
                        totalEstimatedCost: +(totalTokens / 1000 * 0.003).toFixed(4),
                        byAgent,
                        byAction,
                        recentEntries: entries.slice(-100),
                    }
                });
            } catch (e) {
                serveJson(res, 500, { success: false, error: (e as Error).message });
            }
            return;
        }

        // ─── SSE (Server-Sent Events) — Legacy support ─────────────────
        if (pathname === "/api/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });

            // Send initial keepalive
            res.write(": connected\n\n");

            // Keep connection alive
            const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 30000);
            req.on("close", () => clearInterval(keepAlive));
            return;
        }

        // ─── Static UI Serving ─────────────────────────────────────────
        // Confine served files to the UI dist directory (block ../ traversal).
        const uiRoot = path.resolve(uiDistPath);
        const requested = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
        let filePath = path.resolve(uiRoot, requested);
        if (filePath !== uiRoot && !filePath.startsWith(uiRoot + path.sep)) {
            serveJson(res, 403, { error: "Forbidden", message: "Path escapes the UI root" });
            return;
        }

        // Fallback to index.html for SPA routing if file not found
        if (!fs.existsSync(filePath) && !pathname.startsWith("/api")) {
            filePath = path.join(uiRoot, "index.html");
        }

        if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
                ".html": "text/html",
                ".js": "application/javascript",
                ".css": "text/css",
                ".json": "application/json",
                ".png": "image/png",
                ".jpg": "image/jpg",
                ".gif": "image/gif",
                ".svg": "image/svg+xml",
                ".ico": "image/x-icon",
            };
            const contentType = mimeTypes[ext] || "application/octet-stream";
            serveFile(res, filePath, contentType);
        } else {
            serveJson(res, 404, { error: "Not Found", message: "Route not found" });
        }
    });

    // ─── WebSocket Server ──────────────────────────────────────────────
    const wss = new WebSocketServer({ server, path: "/ws" });
    wss.on("connection", (ws) => {
        wsClients.add(ws);
        ws.on("error", () => wsClients.delete(ws));
        ws.on("close", () => wsClients.delete(ws));

        // Send full state to this client immediately on connect
        try {
            const agents = Storage.getAllAgents();
            const messages = Storage.getPendingMessages();
            ws.send(JSON.stringify({ type: "agent_update", payload: agents }));
            ws.send(JSON.stringify({ type: "message", payload: messages }));
        } catch { /* ignore */ }

        ws.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === "ping") {
                    ws.send(JSON.stringify({ type: "pong" }));
                }
            } catch { /* ignore */ }
        });
    });

    // ─── Periodic Live Broadcast (every 5s) ────────────────────────────
    const broadcastInterval = setInterval(() => {
        try {
            // Agents
            const agents = Storage.getAllAgents();
            broadcastWS("agent_update", { agents, timestamp: new Date().toISOString() });

            // Pending Messages
            const messages = Storage.getPendingMessages();
            broadcastWS("message", { messages, timestamp: new Date().toISOString() });

            // Approvals (pending) — via storage abstraction
            const allMessages = Storage.getPendingMessages();
            const approvals = allMessages.filter(
                m => m.category === "ALERT" || m.category === "ACTION"
            );
            broadcastWS("approval", { approvals, timestamp: new Date().toISOString() });

            // Logs
            const logs = Storage.getLogs().slice(-10);
            broadcastWS("log", { logs, timestamp: new Date().toISOString() });
        } catch { /* silent */ }
    }, 5000);

    // Cleanup on server close
    server.on("close", () => {
        clearInterval(broadcastInterval);
        wsClients.clear();
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
            UI.error(`\n[FATAL] Port ${port} is already in use by another process.`);
            UI.error(`Please stop the running process or pass --port <number>.\n`);
            process.exit(1);
        } else {
            UI.error(`\n[FATAL] Server error: ${err.message}\n`);
            process.exit(1);
        }
    });

    const host = process.env.ATABEY_DASHBOARD_HOST || "127.0.0.1";
    assertTransportSecurity(tls, host);
    const scheme = tlsScheme(tls);
    const wsProtocol = wsScheme(tls);
    server.listen(port, host, () => {
        UI.success("\n[START] Hermes Visual Control Plane is running!");
        UI.success(`[INFO] Transport: ${describeTls(tls)}`);
        UI.success(`[INFO] Web UI:    ${scheme}://${host}:${port}`);
        UI.success(`[DATA] API Base:  ${scheme}://${host}:${port}/api`);
        UI.success(`[WS]   WebSocket: ${wsProtocol}://${host}:${port}/ws`);
        UI.success("[ENDPOINTS]");
        UI.success("  GET  /api/health         → System health check");
        UI.success("  GET  /api/status         → Agent statuses");
        UI.success("  GET  /api/memory         → Project memory (Markdown)");
        UI.success("  GET  /api/messages       → Pending Hermes messages");
        UI.success("  GET  /api/tasks          → Active tasks (?traceId=...)");
        UI.success("  GET  /api/agents         → All registered agents");
        UI.success("  POST /api/approve/:id    → Approve a trace");
        UI.success("  GET  /api/compliance     → Compliance violations (?path=...)");
        UI.success("  GET  /api/events         → SSE (legacy)");
        UI.success("  WS   /ws                 → WebSocket real-time (5s interval)");
        UI.success("[LIVE MODULES]");
        UI.success("  🤖 Agents     → agent_update (every 5s)");
        UI.success("  📨 Messages   → message (every 5s)");
        UI.success("  🔐 Approvals  → approval (every 5s)");
        UI.success("  🧠 Memory     → Memory API (on request)");
        UI.success("  🛡️ Compliance → Compliance API (on request)");
        UI.success("  📝 Logs       → log (every 5s)");
        UI.warning("\n(Press Ctrl+C to stop the server)\n");
    });
}
