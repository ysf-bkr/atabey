import http from "http";
import { RouteContext, serveJson } from "./types.js";
import { FinOpsManager } from "../utils/finops.js";

export async function handleFinOpsRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    _context: RouteContext
): Promise<boolean> {
    // GET /api/finops
    if (pathname === "/api/finops" && method === "GET") {
        try {
            const state = FinOpsManager.getBudgetState();
            serveJson(res, 200, { success: true, data: state });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // GET /api/finops/check?agent=...
    if (pathname === "/api/finops/check" && method === "GET") {
        try {
            const agent = params.agent || "default";
            const check = FinOpsManager.checkAgentBudget(agent);
            serveJson(res, 200, { success: true, data: check });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // POST /api/finops/reset
    if (pathname === "/api/finops/reset" && method === "POST") {
        try {
            FinOpsManager.resetBudgetPeriod();
            serveJson(res, 200, { success: true, message: "Budget period reset successfully." });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    // GET /api/finops/daily?days=7
    if (pathname === "/api/finops/daily" && method === "GET") {
        try {
            const days = parseInt(params.days || "7", 10) || 7;
            const history = FinOpsManager.getDailyTokenHistory(days);
            serveJson(res, 200, { success: true, data: history });
        } catch (e) {
            serveJson(res, 500, { success: false, error: (e as Error).message });
        }
        return true;
    }

    return false;
}
