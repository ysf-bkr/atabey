import http from "http";
import { RouteContext, serveJson } from "./types.js";
import { Storage } from "../../shared/storage.js";

export async function handleAgentsRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: RouteContext
): Promise<boolean> {
    const { broadcastWS } = context;

    // GET Agents
    if (pathname === "/api/agents") {
        try {
            const agents = Storage.getAllAgents();
            serveJson(res, 200, { success: true, data: agents });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
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
                    const { AtabeyStorage } = await import("../../shared/storage.js");
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
        return true;
    }

    // POST Delete Agent
    if (pathname.startsWith("/api/agents/delete/") && method === "POST") {
        const agentName = decodeURIComponent(pathname.replace("/api/agents/delete/", ""));
        if (!agentName) { serveJson(res, 400, { success: false, error: "Agent name required" }); return true; }
        try {
            const { AtabeyStorage } = await import("../../shared/storage.js");
            const deleted = AtabeyStorage.deleteAgent(agentName);
            if (deleted) {
                broadcastWS("agent_update", AtabeyStorage.getAllAgents());
                serveJson(res, 200, { success: true, message: `Agent ${agentName} deleted.` });
            } else {
                serveJson(res, 404, { success: false, error: `Agent ${agentName} not found.` });
            }
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
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
                    const { AtabeyStorage } = await import("../../shared/storage.js");
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
        return true;
    }

    return false;
}
