import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "./security.js";
/**
 * Token and Metric Tracker for Agent Atabey.
 * Estimates token usage and logs operational costs.
 */

interface MetricEntry {
    timestamp: string;
    agent: string;
    action: string;
    estimatedTokens: number;
    error?: string;
}

export const Metrics = {
    /**
     * Estimates tokens based on character count (rough heuristic: 1 token ~= 4 chars).
     */
    estimateTokens: (text: string): number => {
        return Math.ceil(text.length / 4);
    },

    /**
     * Logs the token usage and action to the observability metrics file.
     */
    logUsage: (projectRoot: string, agent: string, action: string, tokens: number) => {
        Metrics.saveMetric(projectRoot, {
            timestamp: new Date().toISOString(),
            agent,
            action,
            estimatedTokens: tokens
        });
    },

    /**
     * Logs an error occurrence to the observability metrics file.
     */
    logError: (projectRoot: string, agent: string, action: string, error: string) => {
        Metrics.saveMetric(projectRoot, {
            timestamp: new Date().toISOString(),
            agent,
            action: `ERROR: ${action}`,
            estimatedTokens: 0,
            error
        });
    },

    /**
     * Internal helper to save metric entries.
     */
    saveMetric: (projectRoot: string, entry: MetricEntry) => {
        const frameworkDir = resolveFrameworkDir(projectRoot);
        const metricsPath = path.join(projectRoot, frameworkDir, "observability/metrics.json");
        try {
            const metricsDir = path.dirname(metricsPath);
            if (!fs.existsSync(metricsDir)) fs.mkdirSync(metricsDir, { recursive: true });

            let currentMetrics: MetricEntry[] = [];
            if (fs.existsSync(metricsPath)) {
                currentMetrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
            }

            currentMetrics.push(entry);

            // Keep only last 100 entries to save space
            if (currentMetrics.length > 100) currentMetrics.shift();

            fs.writeFileSync(metricsPath, JSON.stringify(currentMetrics, null, 2));
        } catch { /* ignore: metrics should not block the main process */ }
    }
};
