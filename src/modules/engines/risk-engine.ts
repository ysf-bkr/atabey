import { RiskAssessment, RiskFactor, RiskSeverity } from "./types.js";

/**
 * [SECURITY] Risk Engine (The Guardian)
 * Calculates the danger level of a proposed task or operation.
 */
export class RiskEngine {
    private static HIGH_RISK_KEYWORDS = [
        { word: "delete", weight: 40 },
        { word: "drop", weight: 50 },
        { word: "truncate", weight: 50 },
        { word: "rm -rf", weight: 60 },
        { word: "purge", weight: 40 },
        { word: "format", weight: 50 },
        { word: "force", weight: 20 },
    ];

    private static SENSITIVE_PATHS = [
        { pattern: /\.env/i, weight: 50 },
        { pattern: /config/i, weight: 20 },
        { pattern: /database/i, weight: 30 },
        { pattern: /auth/i, weight: 30 },
        { pattern: /security/i, weight: 30 },
        { pattern: /atabey/i, weight: 40 }, // Framework protection
    ];

    /**
     * Assesses the risk of a natural language task or command string.
     */
    public static assessTaskRisk(task: string): RiskAssessment {
        const factors: RiskFactor[] = [];
        let totalScore = 0;

        // 1. Keyword Analysis
        for (const { word, weight } of this.HIGH_RISK_KEYWORDS) {
            if (new RegExp(`\\b${word}\\b`, "i").test(task)) {
                factors.push({
                    factor: `Keyword: ${word}`,
                    score: weight,
                    description: `Detected high-risk keyword '${word}' in task description.`
                });
                totalScore += weight;
            }
        }

        // 2. Path Sensitivity (if paths are mentioned in the task)
        for (const { pattern, weight } of this.SENSITIVE_PATHS) {
            if (pattern.test(task)) {
                factors.push({
                    factor: `Sensitive Path: ${pattern.source}`,
                    score: weight,
                    description: `Task involves access to sensitive path or pattern: ${pattern.source}`
                });
                totalScore += weight;
            }
        }

        // 3. Complexity Risk (Length of task as a proxy)
        if (task.length > 300) {
            const score = 10;
            factors.push({
                factor: "High Complexity",
                score,
                description: "Task description is unusually long, increasing the chance of misunderstanding."
            });
            totalScore += score;
        }

        return this.finalizeAssessment(totalScore, factors);
    }

    /**
     * Assesses risk based on a proposed file change.
     */
    public static assessChangeRisk(filePath: string, operation: "write" | "replace" | "patch"): RiskAssessment {
        const factors: RiskFactor[] = [];
        let totalScore = 0;

        // 1. Operation Weight
        const opWeights = { write: 30, replace: 5, patch: 10 };
        totalScore += opWeights[operation];
        factors.push({
            factor: `Operation: ${operation}`,
            score: opWeights[operation],
            description: `A '${operation}' operation is inherently riskier than a surgical 'replace'.`
        });

        // 2. File Path Risk
        for (const { pattern, weight } of this.SENSITIVE_PATHS) {
            if (pattern.test(filePath)) {
                factors.push({
                    factor: `Sensitive File: ${filePath}`,
                    score: weight,
                    description: "Modifying a sensitive file is high risk."
                });
                totalScore += weight;
            }
        }

        return this.finalizeAssessment(totalScore, factors);
    }

    private static finalizeAssessment(totalScore: number, factors: RiskFactor[]): RiskAssessment {
        let severity: RiskSeverity = "LOW";
        if (totalScore >= 80) severity = "CRITICAL";
        else if (totalScore >= 50) severity = "HIGH";
        else if (totalScore >= 20) severity = "MEDIUM";

        return {
            totalScore: Math.min(totalScore, 100),
            severity,
            factors,
            requiresApproval: totalScore >= 60
        };
    }
}
