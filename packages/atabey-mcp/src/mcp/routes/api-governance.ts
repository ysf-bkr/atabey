import http from "http";
import path from "path";
import { RouteContext, serveJson } from "./types.js";
import { Storage } from "../../shared/storage.js";
import { Audit } from "../../shared/audit.js";

export async function handleGovernanceRoutes(
    pathname: string,
    params: Record<string, string>,
    method: string,
    req: http.IncomingMessage,
    res: http.ServerResponse,
    context: RouteContext
): Promise<boolean> {
    const { PROJECT_ROOT } = context;

    // Audit (GDPR/KVKK)
    if (pathname === "/api/audit") {
        try {
            Audit.initialize();
            const stats = Audit.getStats();
            const entries = Audit.query({ limit: 100 });
            serveJson(res, 200, { success: true, data: { stats, entries } });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
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
        return true;
    }

    // Compliance
    if (pathname === "/api/compliance") {
        try {
            const { scanProjectCompliance } = await import("atabey/src/cli/utils/compliance.js");
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
        return true;
    }

    // Quality
    if (pathname === "/api/quality") {
        try {
            const { analyzePathQuality } = await import("atabey/src/cli/utils/quality.js");
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
        return true;
    }

    // Budget / FinOps Status
    if (pathname === "/api/finops") {
        try {
            const { budgetManager } = await import("../utils/finops.js");
            const state = budgetManager.getState();
            serveJson(res, 200, { success: true, data: state });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Budget Check for an agent
    if (pathname === "/api/finops/check") {
        try {
            const agent = params.agent || "default";
            const { budgetManager } = await import("../utils/finops.js");
            const result = budgetManager.checkBudget(agent);
            serveJson(res, 200, { success: true, data: result });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Budget Reset
    if (pathname === "/api/finops/reset" && method === "POST") {
        try {
            const { budgetManager } = await import("../utils/finops.js");
            budgetManager.resetPeriod();
            serveJson(res, 200, { success: true, message: "Budget period reset." });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // License Scanner
    if (pathname === "/api/license") {
        try {
            const { scanForLicenses, getLicenseSeveritySummary, LicenseScannerConfig } = await import("../utils/license-scanner.js");
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
        return true;
    }

    // Auto-Rollback Stats
    if (pathname === "/api/rollback") {
        try {
            const { AutoRollbackEngine } = await import("../utils/auto-rollback.js");
            const stats = AutoRollbackEngine.getSnapshotStats();
            serveJson(res, 200, { success: true, data: stats });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // All Governance Stats (combined endpoint)
    if (pathname === "/api/governance") {
        try {
            const { getAllLoopStats } = await import("../utils/loop-detector.js");
            const { AutoRollbackEngine } = await import("../utils/auto-rollback.js");
            const { budgetManager } = await import("../utils/finops.js");

            serveJson(res, 200, {
                success: true, data: {
                    loopDetection: getAllLoopStats(),
                    rollback: AutoRollbackEngine.getSnapshotStats(),
                    budget: budgetManager.getState(),
                    telemetry: (await import("../utils/telemetry-streamer.js")).telemetryStreamer.getStatus(),
                }
            });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Discipline Stats
    if (pathname === "/api/discipline") {
        try {
            const { getAllDisciplineStats } = await import("../utils/discipline.js");
            const stats = getAllDisciplineStats();
            serveJson(res, 200, { success: true, data: stats });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Loop Detection Stats
    if (pathname === "/api/loop-detector") {
        try {
            const { getAllLoopStats } = await import("../utils/loop-detector.js");
            const agent = params.agent;
            const stats = agent
                ? (await import("../utils/loop-detector.js")).getLoopStats(agent)
                : getAllLoopStats();
            serveJson(res, 200, { success: true, data: stats });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    // Clear Loop Cooldown
    if (pathname.startsWith("/api/loop-detector/clear/") && method === "POST") {
        const agent = decodeURIComponent(pathname.replace("/api/loop-detector/clear/", ""));
        try {
            const { clearCooldown } = await import("../utils/loop-detector.js");
            const cleared = clearCooldown(agent);
            serveJson(res, 200, { success: true, data: { agent, cleared } });
        } catch (e) { serveJson(res, 500, { success: false, error: (e as Error).message }); }
        return true;
    }

    return false;
}
