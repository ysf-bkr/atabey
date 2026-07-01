import http from "http";
import fs from "fs";
import path from "path";
import { RouteContext, serveJson } from "./types.js";
import { Storage } from "../../shared/storage.js";

export async function handleWorkspaceRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: RouteContext
): Promise<boolean> {
    const { sessions, PROJECT_ROOT, HOST, PORT } = context;

    // Workspace list
    if (pathname === "/api/workspace" && method === "GET") {
        try {
            const { WorkspaceManager } = await import("../utils/workspace.js");
            WorkspaceManager.initialize(PROJECT_ROOT);
            const workspaces = WorkspaceManager.listWorkspaces();
            const stats = WorkspaceManager.getStats();
            serveJson(res, 200, { success: true, data: { workspaces, stats } });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Workspace Setup
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
                    const { WorkspaceManager } = await import("../utils/workspace.js");
                    const { ClientConfigGenerator } = await import("../utils/client-config.js");
                    WorkspaceManager.initialize(PROJECT_ROOT);
                    const workspace = await WorkspaceManager.getOrCreateWorkspace(userName);

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
        return true;
    }

    // MCP Sessions
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
        return true;
    }

    // Dispatch Task
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

                    const { saveWebConfig } = await import("../utils/web-config.js");
                    saveWebConfig({ projectPath });

                    const { asAgentID, asTraceID } = await import("../../shared/types.js");
                    const traceId = "T-" + Date.now().toString().slice(-6);

                    Storage.setMetadata("traceId", traceId);
                    Storage.setMetadata("phase", "PHASE_0");

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

                    context.broadcastWS("message", hermesMsg);
                    context.broadcastWS("log", {
                        timestamp: new Date().toISOString(),
                        agent: "web-user",
                        action: "DISPATCH",
                        trace_id: traceId,
                        status: "SUCCESS",
                        summary: `Dispatched task to ${agent}: ${message.substring(0, 50)}...`
                    });

                    const { startOrchestratorLoop } = await import("../utils/web-config.js");
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
        return true;
    }

    // Browse directories
    if (pathname === "/api/project/browse-dirs" && method === "GET") {
        try {
            const os = await import("os");
            let target = params.path ? String(params.path) : "";
            if (!target) {
                const { loadWebConfig } = await import("../utils/web-config.js");
                target = loadWebConfig().projectPath || os.homedir();
            }

            target = path.resolve(target);

            if (!fs.existsSync(target)) {
                serveJson(res, 404, { success: false, error: "Path not found" });
                return true;
            }

            const stats = fs.statSync(target);
            if (!stats.isDirectory()) {
                serveJson(res, 400, { success: false, error: "Not a directory" });
                return true;
            }

            const files = fs.readdirSync(target);
            const dirs: { name: string; path: string }[] = [];

            for (const file of files) {
                if (file.startsWith(".")) continue;
                try {
                    const fullPath = path.join(target, file);
                    const isDir = fs.statSync(fullPath).isDirectory();
                    if (isDir) {
                        dirs.push({ name: file, path: fullPath });
                    }
                } catch {
                    // ignore
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
        return true;
    }

    // Project files list
    if (pathname === "/api/project/files" && method === "GET") {
        try {
            const { loadWebConfig } = await import("../utils/web-config.js");
            const config = loadWebConfig();
            const projectDir = config.projectPath;

            const subDir = params.path ? String(params.path) : "";
            let targetDir = projectDir;

            if (subDir) {
                targetDir = path.resolve(projectDir, subDir);
                if (!targetDir.startsWith(projectDir)) {
                    serveJson(res, 403, { success: false, error: "Access denied" });
                    return true;
                }
            }

            if (!fs.existsSync(targetDir)) {
                serveJson(res, 404, { success: false, error: "Project path not found" });
                return true;
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
                    // ignore
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
        return true;
    }

    // Project file content
    if (pathname === "/api/project/file-content" && method === "GET") {
        try {
            const { loadWebConfig } = await import("../utils/web-config.js");
            const config = loadWebConfig();
            const projectDir = config.projectPath;

            const filePath = params.path ? String(params.path) : "";
            if (!filePath) {
                serveJson(res, 400, { success: false, error: "path parameter is required" });
                return true;
            }

            const absoluteFilePath = path.resolve(projectDir, filePath);
            if (!absoluteFilePath.startsWith(projectDir)) {
                serveJson(res, 403, { success: false, error: "Access denied" });
                return true;
            }

            if (!fs.existsSync(absoluteFilePath) || fs.statSync(absoluteFilePath).isDirectory()) {
                serveJson(res, 404, { success: false, error: "File not found" });
                return true;
            }

            const size = fs.statSync(absoluteFilePath).size;
            if (size > 2 * 1024 * 1024) {
                serveJson(res, 400, { success: false, error: "File is too large (max 2MB)" });
                return true;
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
        return true;
    }

    return false;
}
