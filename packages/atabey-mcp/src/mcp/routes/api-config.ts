import http from "http";
import path from "path";
import { RouteContext, serveJson } from "./types.js";
import { Storage } from "../../shared/storage.js";
import { logger } from "../../shared/logger.js";

export async function handleConfigRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: RouteContext
): Promise<boolean> {

    // Knowledge Base List
    if (pathname === "/api/knowledge" && req.method === "GET") {
        try {
            const list = Storage.getKnowledgeList();
            serveJson(res, 200, { success: true, data: list });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Knowledge View
    if (pathname === "/api/knowledge/view" && req.method === "GET") {
        try {
            const file = params.file;
            if (!file) {
                serveJson(res, 400, { success: false, error: "Missing 'file' parameter" });
                return true;
            }
            const doc = Storage.getKnowledgeFile(file);
            if (!doc) {
                serveJson(res, 404, { success: false, error: "File not found" });
                return true;
            }
            serveJson(res, 200, { success: true, data: doc });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Knowledge Update
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
                    Storage.saveKnowledgeFile(safeFile, content);
                    serveJson(res, 200, { success: true, message: `Knowledge document '${safeFile}' updated successfully.` });
                } catch (err) {
                    serveJson(res, 400, { success: false, error: (err as Error).message });
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Knowledge Delete
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
                    Storage.deleteKnowledgeFile(safeFile);
                    serveJson(res, 200, { success: true, message: `Knowledge document '${safeFile}' deleted.` });
                } catch (err) {
                    serveJson(res, 400, { success: false, error: (err as Error).message });
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Constitution List
    if (pathname === "/api/constitution" && req.method === "GET") {
        try {
            const db = Storage.getDB();
            const sections = db.prepare("SELECT * FROM constitution ORDER BY priority DESC").all();
            serveJson(res, 200, { success: true, data: sections });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Constitution Update
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
                    const db = Storage.getDB();
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
        return true;
    }

    // CLI Commands
    if (pathname === "/api/cli-commands" && req.method === "GET") {
        try {
            const db = Storage.getDB();
            const commands = db.prepare("SELECT * FROM cli_commands ORDER BY command").all();
            serveJson(res, 200, { success: true, data: commands });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Prompts List
    if (pathname === "/api/prompts" && req.method === "GET") {
        try {
            const db = Storage.getDB();
            const prompts = db.prepare("SELECT * FROM prompts ORDER BY category, name").all();
            serveJson(res, 200, { success: true, data: prompts });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Prompts Update
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
                    const db = Storage.getDB();
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
        return true;
    }

    // Rules List
    if (pathname === "/api/rules" && req.method === "GET") {
        try {
            const db = Storage.getDB();
            const rules = db.prepare("SELECT * FROM rules ORDER BY name").all();
            serveJson(res, 200, { success: true, data: rules });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Rules Update
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
                    const db = Storage.getDB();
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
        return true;
    }

    // Registry List
    if (pathname === "/api/registry" && req.method === "GET") {
        try {
            const db = Storage.getDB();
            const items = db.prepare("SELECT * FROM registry ORDER BY type, name").all();
            serveJson(res, 200, { success: true, data: items });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Registry Update
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
                    const db = Storage.getDB();
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
        return true;
    }

    // Settings (Config settings - legacy)
    if (pathname === "/api/settings" && req.method === "GET" && !params.legacy_check) {
        // Wait, index.ts has two distinct "/api/settings" GET/POST blocks.
        // One is in lines 728-751 (projectPath & activeProvider from Storage)
        // One is in lines 1061-1100 (loadWebConfig from web-config.js)
        // Let's check which one matches what.
        // The one in lines 1061 loads safe config with keys. Let's merge them!
        // Actually, let's keep both, but we can differentiate them by headers/body, or just keep them as they were.
        // Let's implement the first one if it doesn't match the second one.
        // Actually, the second one uses `loadWebConfig` which is preferred for dashboard UI configuration.
        // Let's merge them: if it's GET, we return the settings loaded from webConfig and from metadata.
    }

    // Let's check settings routes specifically:
    // GET Settings (Combined load)
    if (pathname === "/api/settings" && req.method === "GET") {
        try {
            const { loadWebConfig } = await import("../utils/web-config.js");
            const config = loadWebConfig();
            const projectPath = config.projectPath || Storage.getMetadata("projectPath") || "";
            const activeProvider = config.activeProvider || Storage.getMetadata("activeProvider") || "gemini";
            const safeConfig = {
                projectPath,
                activeProvider,
                geminiApiKey: config.geminiApiKey ? "********" : "",
                anthropicApiKey: config.anthropicApiKey ? "********" : "",
                openaiApiKey: config.openaiApiKey ? "********" : "",
            };
            serveJson(res, 200, { success: true, data: safeConfig });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // POST Settings (Save)
    if (pathname === "/api/settings" && req.method === "POST") {
        try {
            let body = "";
            req.on("data", chunk => { body += chunk.toString(); });
            req.on("end", async () => {
                try {
                    const parsed = JSON.parse(body);
                    
                    // Metadata storage
                    if (parsed.projectPath !== undefined) Storage.setMetadata("projectPath", parsed.projectPath);
                    if (parsed.activeProvider !== undefined) Storage.setMetadata("activeProvider", parsed.activeProvider);
                    
                    // Config file storage
                    const { saveWebConfig } = await import("../utils/web-config.js");
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
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Config metadata GET
    if (pathname === "/api/config" && req.method === "GET") {
        try {
            const db = Storage.getDB();
            const configs = db.prepare("SELECT * FROM metadata WHERE key LIKE 'config.%'").all() as Array<{ key: string; value: string }>;
            const config: Record<string, string> = {};
            for (const c of configs) {
                config[c.key.replace("config.", "")] = c.value;
            }
            serveJson(res, 200, { success: true, data: config });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Adapter Skills summary
    if (pathname === "/api/adapters/skills") {
        try {
            const { ADAPTER_SKILLS } = await import("atabey/src/modules/skills/adapter-skills.js");
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
        return true;
    }

    // Adapter Skill Toggle
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
        return true;
    }

    // Auth Login
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

                    const maskedToken = token.length > 8 ? `${token.slice(0, 4)}...${token.slice(-4)}` : "***";
                    logger.info(`[LOGIN ATTEMPT] username="${username}", token="${maskedToken}"`);
                    const { authenticateToken } = await import("../utils/auth.js");
                    const result = authenticateToken(token);
                    logger.info(`[LOGIN RESULT] authenticated=${result.authenticated}, user="${result.user}"`);

                    if (result.authenticated && (result.user === username || (result.user === "admin" && username === "admin"))) {
                        serveJson(res, 200, { success: true, user: { name: username, role: result.user === "admin" ? "admin" : "user" } });
                    } else {
                        serveJson(res, 401, { success: false, error: "Invalid username or token" });
                    }
                } catch (err) {
                    logger.error(`[LOGIN ERROR] ${(err as Error).message}`);
                    serveJson(res, 400, { success: false, error: (err as Error).message });
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // GET Admin Users
    if (pathname === "/api/admin/users" && req.method === "GET") {
        try {
            const users = Storage.getUsers();
            serveJson(res, 200, { success: true, data: users });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
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
                    Storage.createUser(name.trim(), token.trim(), role || "user");
                    serveJson(res, 200, { success: true, message: `User ${name} created/updated successfully.` });
                } catch (err) {
                    serveJson(res, 400, { success: false, error: (err as Error).message });
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
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
                    Storage.deleteUser(name);
                    serveJson(res, 200, { success: true, message: `User ${name} deleted.` });
                } catch (err) {
                    serveJson(res, 400, { success: false, error: (err as Error).message });
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Orchestrator Status
    if (pathname === "/api/orchestrator/status" && method === "GET") {
        try {
            const { getOrchestratorState } = await import("../utils/web-config.js");
            serveJson(res, 200, { success: true, data: getOrchestratorState() });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Orchestrator Start
    if (pathname === "/api/orchestrator/start" && method === "POST") {
        try {
            const { startOrchestratorLoop } = await import("../utils/web-config.js");
            const result = startOrchestratorLoop();
            if (result.success) {
                context.broadcastWS("orchestrator_state", { running: true });
                serveJson(res, 200, { success: true, message: result.message });
            } else {
                serveJson(res, 400, { success: false, error: result.message });
            }
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Orchestrator Stop
    if (pathname === "/api/orchestrator/stop" && method === "POST") {
        try {
            const { stopOrchestratorLoop } = await import("../utils/web-config.js");
            const result = stopOrchestratorLoop();
            if (result.success) {
                context.broadcastWS("orchestrator_state", { running: false });
                serveJson(res, 200, { success: true, message: result.message });
            } else {
                serveJson(res, 400, { success: false, error: result.message });
            }
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // GET Token Budget Config
    if (pathname === "/api/token-budget/config" && method === "GET") {
        try {
            const { getTokenBudgetConfig } = await import("../utils/context-optimizer.js");
            const config = getTokenBudgetConfig();
            serveJson(res, 200, { success: true, data: config });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // UPDATE Token Budget Config
    if (pathname === "/api/token-budget/config/update" && method === "POST") {
        try {
            let body = "";
            req.on("data", chunk => { body += chunk.toString(); });
            req.on("end", async () => {
                try {
                    const parsed = JSON.parse(body);
                    const { updateTokenBudgetConfig } = await import("../utils/context-optimizer.js");
                    updateTokenBudgetConfig(parsed);
                    serveJson(res, 200, { success: true, message: "Token budget configuration updated successfully." });
                } catch (err) {
                    serveJson(res, 400, { success: false, error: (err as Error).message });
                }
            });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // RESET Agent Token Budgets
    if (pathname === "/api/token-budget/reset" && method === "POST") {
        try {
            const { resetTokenBudgets } = await import("../utils/context-optimizer.js");
            resetTokenBudgets();
            serveJson(res, 200, { success: true, message: "All agent token budgets reset successfully." });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // Telemetry Status
    if (pathname === "/api/telemetry") {
        try {
            const { telemetryStreamer, TelemetryConfig } = await import("../utils/telemetry-streamer.js");
            const status = telemetryStreamer.getStatus();
            serveJson(res, 200, { success: true, data: { ...status, config: { ...TelemetryConfig, AUTH_TOKEN: TelemetryConfig.AUTH_TOKEN ? "***" : "" } } });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    return false;
}
