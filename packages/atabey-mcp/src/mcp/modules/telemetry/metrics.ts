import fs from "fs";
import path from "path";
import { AtomicFileLock } from "atabey-shared/file-lock.js";
import { countTokens, measureToolCallUsage } from "atabey-shared/tokenizer.js";
import { Storage } from "atabey-shared/storage.js";
import { resolveFrameworkDir } from "atabey-mcp/utils/security.js";
import { logger } from "../../../shared/logger.js";
/**
 * Token and Metric Tracker for Atabey.
 * Uses an approximate cl100k-style token estimator + multi-provider token pricing.
 */

interface MetricEntry {
    timestamp: string;
    agent: string;
    action: string;
    estimatedTokens: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    model?: string;
    error?: string;
}

export const Metrics = {
    /**
     * Estimates tokens with an approximate cl100k-style pre-tokenizer (see tokenizer.ts).
     */
    estimateTokens: (text: string, model?: string): number => {
        return countTokens(text, model);
    },

    /**
     * Logs the token usage and action to the observability metrics file.
     */
    logUsage: (
        projectRoot: string,
        agent: string,
        action: string,
        tokens: number,
        details?: { inputTokens?: number; outputTokens?: number; costUsd?: number; model?: string; traceId?: string },
    ) => {
        Metrics.saveMetric(projectRoot, {
            timestamp: new Date().toISOString(),
            agent,
            action,
            estimatedTokens: tokens,
            inputTokens: details?.inputTokens,
            outputTokens: details?.outputTokens,
            costUsd: details?.costUsd,
            model: details?.model,
        });
    },

    /**
     * Measures full input + output token breakdown and persists token usage to SQLite + metrics.json.
     */
    recordToolCallUsage: (
        projectRoot: string,
        agent: string,
        toolName: string,
        args: unknown,
        resultText: string,
        traceId?: string,
        model?: string,
    ) => {
        const usage = measureToolCallUsage(toolName, args, resultText, model);
        Metrics.logUsage(projectRoot, agent, toolName, usage.totalTokens, {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            costUsd: usage.estimatedCostUsd,
            model: usage.model,
            traceId,
        });
        try {
            Storage.saveCost({
                provider: usage.provider,
                model: usage.model,
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                cost: usage.estimatedCostUsd,
                timestamp: new Date().toISOString(),
                traceId,
            });
        } catch (err) {
            logger.debug("Token metrics operation failed (non-fatal)", err);
        }
        return usage;
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

            // Serialize read-modify-write across processes/workers so concurrent
            // tool calls don't lose entries or corrupt the JSON file.
            const lock = new AtomicFileLock({
                projectRoot,
                locksDir: path.join(projectRoot, ".atabey", "locks"),
            });
            lock.withLockSync(metricsPath, "metrics", () => {
                let currentMetrics: MetricEntry[] = [];
                if (fs.existsSync(metricsPath)) {
                    try {
                        currentMetrics = JSON.parse(fs.readFileSync(metricsPath, "utf8")) as MetricEntry[];
                    } catch {
                        currentMetrics = [];
                    }
                }

                currentMetrics.push(entry);

                // Keep only last 100 entries to save space
                if (currentMetrics.length > 100) currentMetrics.shift();

                fs.writeFileSync(metricsPath, JSON.stringify(currentMetrics, null, 2));
            });
        } catch (err) { logger.debug("Token metrics operation failed (non-fatal)", err); }
    }
};
