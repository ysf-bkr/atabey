import fs from "fs";
import path from "path";
import { scanProjectCompliance } from "../../cli/utils/compliance.js";
import { getFrameworkDir } from "../../cli/utils/memory.js";
import { ensureDir, writeJsonFile } from "../../shared/fs.js";
import { Storage } from "../../shared/storage.js";
import { EvaluationResult, ProjectHealth } from "./types.js";

/**
 * [DATA] Evaluation & Health Engine
 * Rates agent performance and tracks overall project stability.
 * Now uses real metrics from SQLite, compliance scans, and agent states.
 */
export class HealthEngine {
    /**
     * Records a post-task evaluation.
     */
    public static async recordEvaluation(result: EvaluationResult): Promise<void> {
        const evalDir = path.join(getFrameworkDir(), "memory", "evaluations");
        ensureDir(evalDir);

        const filePath = path.join(evalDir, `${result.traceId}_${result.agent}.json`);
        writeJsonFile(filePath, result);

        // Trigger health update
        await this.updateProjectHealth();
    }

    /**
     * Aggregates real data to calculate the overall Project Health.
     * Uses actual metrics from:
     * - Agent success rates from SQLite logs
     * - Compliance violations from AST scanning
     * - Agent state distribution (blocked/ready ratio)
     * - Test results from recent evaluations
     */
    public static async updateProjectHealth(): Promise<ProjectHealth> {
        const frameworkDir = getFrameworkDir();
        const agents = Storage.getAllAgents();
        const logs = Storage.getLogs();
        const evaluationsDir = path.join(frameworkDir, "memory", "evaluations");

        // 1. Agent Health Score (based on success rate & state distribution)
        let agentScore = 100;
        const totalLogs = logs.length;
        if (totalLogs > 0) {
            const successCount = logs.filter((l) => l.status === "SUCCESS").length;
            const successRate = (successCount / totalLogs) * 100;
            agentScore = Math.round(successRate);
        }

        // Penalize blocked/timeout agents
        const blockedAgents = agents.filter((a) => a.state === "BLOCKED" || a.state === "TIMEOUT").length;
        if (blockedAgents > 0) {
            agentScore -= blockedAgents * 10;
        }

        // 2. Code Quality Score (based on compliance violations)
        let qualityScore = 100;
        try {
            const violations = scanProjectCompliance("src");
            if (violations.length > 0) {
                qualityScore -= Math.min(violations.length * 5, 50);
            }
        } catch {
            qualityScore = 70; // Fallback if scan fails
        }

        // 3. Security Score (based on evaluation findings)
        let securityScore = 100;
        if (fs.existsSync(evaluationsDir)) {
            const evalFiles = fs.readdirSync(evaluationsDir).filter((f) => f.endsWith(".json"));
            let securityIssues = 0;
            let totalEvalMetrics = 0;

            for (const file of evalFiles.slice(-20)) { // Last 20 evaluations
                try {
                    const evalData = JSON.parse(
                        fs.readFileSync(path.join(evaluationsDir, file), "utf8")
                    ) as EvaluationResult;
                    if (evalData.metrics) {
                        totalEvalMetrics++;
                        if (!evalData.metrics.compilation) securityIssues += 2;
                        if (!evalData.metrics.lint) securityIssues += 1;
                        if (!evalData.metrics.tests) securityIssues += 3;
                    }
                } catch {
                    // Skip corrupted files
                }
            }

            if (totalEvalMetrics > 0) {
                securityScore -= Math.min((securityIssues / totalEvalMetrics) * 20, 40);
            }
        }

        // 4. Architecture Score (based on metadata stability)
        const phaseOrder = ["PHASE_0", "PHASE_1", "PHASE_2", "PHASE_3", "PHASE_4"];
        const currentPhase = Storage.getMetadata("phase") || "PHASE_0";
        const phaseIndex = phaseOrder.indexOf(currentPhase);
        const architectureScore = Math.min(60 + phaseIndex * 10, 100);

        // Calculate weighted final score
        const score = Math.max(0, Math.min(100,
            Math.round(
                agentScore * 0.30 +   // Agent performance: 30%
                qualityScore * 0.25 +  // Code quality: 25%
                securityScore * 0.25 + // Security: 25%
                architectureScore * 0.20 // Architecture: 20%
            )
        ));

        const health: ProjectHealth = {
            score,
            codeQuality: Math.max(0, qualityScore),
            security: Math.max(0, securityScore),
            architecture: architectureScore,
            agentHealth: Math.max(0, agentScore),
            totalAgents: agents.length,
            activeAgents: agents.filter((a) => a.state === "EXECUTING" || a.state === "ACTIVE").length,
            blockedAgents,
            totalLogs,
            lastUpdated: new Date().toISOString()
        };

        const healthFile = path.join(frameworkDir, "memory", "HEALTH.json");
        writeJsonFile(healthFile, health);

        return health;
    }

    public static getHealth(): ProjectHealth | null {
        try {
            const healthFile = path.join(getFrameworkDir(), "memory", "HEALTH.json");
            if (!fs.existsSync(healthFile)) return null;
            return JSON.parse(fs.readFileSync(healthFile, "utf8"));
        } catch {
            return null;
        }
    }
}
