import { RiskAssessment, RiskFactor, RiskSeverity } from "./types.js";

/**
 * [SECURITY] Risk Engine (The Guardian)
 * Calculates the danger level of a proposed task or operation.
 *
 * Scoring model (v2 — contextual behavioral analysis):
 * - Keyword signals:   intent words in natural-language task descriptions
 * - Path signals:      sensitivity of file paths / env patterns
 * - Behavioral signals: blast-radius proxies — file count, line deletions, bulk patterns
 * - Complexity signal: task description length as misunderstanding proxy
 *
 * requiresApproval threshold: totalScore >= 60
 */
export class RiskEngine {
    private static HIGH_RISK_KEYWORDS = [
        { word: "delete",   weight: 40 },
        { word: "drop",     weight: 50 },
        { word: "truncate", weight: 50 },
        { word: "rm -rf",   weight: 60 },
        { word: "purge",    weight: 40 },
        { word: "format",   weight: 50 },
        { word: "force",    weight: 20 },
    ];

    private static SENSITIVE_PATHS = [
        { pattern: /\.env/i,      weight: 50 },
        { pattern: /config/i,     weight: 20 },
        { pattern: /database/i,   weight: 30 },
        { pattern: /auth/i,       weight: 30 },
        { pattern: /security/i,   weight: 30 },
        { pattern: /atabey/i,     weight: 40 }, // Framework self-protection
    ];

    // ─── Behavioral Signal Patterns ──────────────────────────────────────────
    // Glob / wildcard patterns in paths that indicate bulk/mass-scope operations.
    private static BULK_SCOPE_PATTERNS = [
        /\*\*/,           // recursive glob
        /\*\.[a-z]{2,4}/, // wildcard extension (*.ts, *.js)
        /\/\*$/,          // directory wildcard
    ];

    /**
     * Assesses the risk of a natural language task or command string.
     * Combines keyword analysis, path sensitivity, and complexity signals.
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

        // 3. Behavioral — Bulk scope detection in task text
        for (const pattern of this.BULK_SCOPE_PATTERNS) {
            if (pattern.test(task)) {
                const score = 25;
                factors.push({
                    factor: "Bulk Scope Pattern",
                    score,
                    description: `Task references a wildcard/glob pattern (${pattern.source}), indicating a potentially mass-scope operation.`
                });
                totalScore += score;
                break; // count once even if multiple glob patterns match
            }
        }

        // 4. Behavioral — Line deletion volume proxy
        //    Detect phrases like "delete all", "remove all", "wipe", "clear all"
        if (/\b(delete|remove|wipe|clear)\s+all\b/i.test(task)) {
            const score = 30;
            factors.push({
                factor: "Mass Deletion Intent",
                score,
                description: "Task uses mass-deletion language ('delete all', 'remove all', 'wipe', 'clear all') suggesting bulk data destruction."
            });
            totalScore += score;
        }

        // 5. Complexity Risk (Length as misunderstanding proxy)
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
     * Adds behavioral signals: file count impact and bulk-scope path patterns.
     */
    public static assessChangeRisk(
        filePath: string,
        operation: "write" | "replace" | "patch",
        options?: {
            /** Number of files touched by this operation (for multi-file tools) */
            affectedFileCount?: number;
            /** Approximate number of lines being deleted */
            deletedLineCount?: number;
        }
    ): RiskAssessment {
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

        // 3. Behavioral — Bulk scope path (glob/wildcard in filePath)
        for (const pattern of this.BULK_SCOPE_PATTERNS) {
            if (pattern.test(filePath)) {
                const score = 25;
                factors.push({
                    factor: "Bulk Scope Path",
                    score,
                    description: `File path '${filePath}' contains a wildcard/glob pattern, suggesting a mass-scope write operation.`
                });
                totalScore += score;
                break;
            }
        }

        // 4. Behavioral — File count impact
        //    Writing to many files at once multiplies blast radius.
        const { affectedFileCount = 1, deletedLineCount = 0 } = options ?? {};
        if (affectedFileCount > 10) {
            const score = Math.min(affectedFileCount * 2, 40);
            factors.push({
                factor: `High File Count: ${affectedFileCount} files`,
                score,
                description: `Operation touches ${affectedFileCount} files — high blast radius.`
            });
            totalScore += score;
        } else if (affectedFileCount > 3) {
            const score = 15;
            factors.push({
                factor: `Multi-file: ${affectedFileCount} files`,
                score,
                description: `Operation touches ${affectedFileCount} files — moderate blast radius.`
            });
            totalScore += score;
        }

        // 5. Behavioral — Line deletion volume
        //    Bulk line deletions (>100 lines) indicate destructive operations.
        if (deletedLineCount > 500) {
            const score = 35;
            factors.push({
                factor: `Mass Line Deletion: ${deletedLineCount} lines`,
                score,
                description: `Operation deletes ${deletedLineCount} lines — very high data destruction risk.`
            });
            totalScore += score;
        } else if (deletedLineCount > 100) {
            const score = 20;
            factors.push({
                factor: `Large Line Deletion: ${deletedLineCount} lines`,
                score,
                description: `Operation deletes ${deletedLineCount} lines — elevated data destruction risk.`
            });
            totalScore += score;
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
