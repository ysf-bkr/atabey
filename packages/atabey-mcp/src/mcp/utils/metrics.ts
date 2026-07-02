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
     * Estimates tokens using an improved heuristic.
     *
     * NOTE: This is still an approximation only.
     * Real token counts depend on the underlying model's tokenizer (e.g. cl100k_base).
     * No actual tokenizer is used here to avoid heavy dependencies.
     *
     * Rough rules of thumb:
     * - ~4 chars ≈ 1 token for English
     * - Code tends to use slightly more tokens
     * - We add a small word-boundary adjustment
     */
    estimateTokens: (text: string): number => {
        if (!text) return 0;
        const chars = text.length;
        const words = text.trim().split(/\s+/).filter(Boolean).length;

        // Base: 1 token per ~3.8 chars + 0.2 per word for overhead
        const estimate = (chars / 3.8) + (words * 0.2);
        return Math.ceil(estimate);
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
