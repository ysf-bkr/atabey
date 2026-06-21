import chalk from "chalk";
import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { getFrameworkDir, listTasks, readState, readStatus } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

/**
 * Print the current framework status.
 */
export async function statusCommand() {
    const state = readState();
    const tasks = listTasks();
    const agentStatuses = readStatus();
    const frameworkDir = getFrameworkDir();

    if (!state) {
        UI.error("Memory state not found. Please run 'init' first.");
        return;
    }

    UI.info("--- PROJECT STATUS ---");
    UI.info(`Phase: ${state.phase}`);
    UI.info(`Trace ID: ${state.traceId}`);
    UI.info(`Manager: ${state.managerState}`);

    // --- Health Engine Integration ---
    try {
        const { HealthEngine } = await import("../../modules/engines/health-engine.js");
        const health = HealthEngine.getHealth();
        if (health) {
            let healthColor = chalk.green;
            if (health.score < 50) healthColor = chalk.red;
            else if (health.score < 80) healthColor = chalk.yellow;

            UI.info(`Project Health: ${healthColor(health.score + "%")} (Quality: ${health.codeQuality} | Security: ${health.security})`);
        }
    } catch (err) {
        logger.debug("Health engine not initialized or compiled yet", err);
    }

    // Read Agent Status from Storage
    UI.info("Atabey AL Status (Agent States & Performance):");
    const { Storage } = await import("../../shared/storage.js");

    for (const [agentName, info] of Object.entries(agentStatuses)) {
        const { state, task } = info as { state: string; task: string };
        let coloredState = state;
        if (state === "READY") coloredState = chalk.green(state);
        else if (state === "EXECUTING") coloredState = chalk.yellow(state);
        else if (state === "BLOCKED" || state === "TIMEOUT") coloredState = chalk.red(state);
        else if (state === "WAITING") coloredState = chalk.cyan(state);

        // Calculate Success Rate from SQLite logs
        let successRateStr = "";
        const logs = Storage.getLogs(agentName);
        const total = logs.length;
        if (total > 0) {
            const successCount = logs.filter(l => l.status === "SUCCESS").length;
            const rate = (successCount / total) * 100;
            successRateStr = ` | Success Rate: ${rate.toFixed(1)}% (${successCount}/${total})`;
        }

        process.stdout.write(`  ${chalk.bold(agentName.padEnd(12))} : [${coloredState}] - ${task}${successRateStr}\n`);
    }

    if (tasks.length > 0) {
        UI.info("Active Tasks:");
        tasks.forEach((t) => {
            const agent = t.agent.startsWith("@") ? t.agent : `@${t.agent}`;
            process.stdout.write(`  - [${t.priority}] ${t.status}: ${t.description} (${agent})\n`);
        });
    }

    const metricsPath = path.join(frameworkDir, "observability", "metrics.json");
    if (fs.existsSync(metricsPath)) {
        try {
            const rawMetrics = fs.readFileSync(metricsPath, "utf8");
            const metrics = JSON.parse(rawMetrics) as Array<{ agent: string; estimatedTokens: number; timestamp?: string }>;

            let totalTokens = 0;
            const agentTokens: Record<string, number> = {};

            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            let weeklyTokens = 0;
            const weeklyAgentTokens: Record<string, number> = {};

            metrics.forEach(m => {
                totalTokens += m.estimatedTokens;
                const name = m.agent.startsWith("@") ? m.agent : `@${m.agent}`;
                agentTokens[name] = (agentTokens[name] || 0) + m.estimatedTokens;

                // Track weekly tokens if entry falls within last 7 days
                const entryDate = m.timestamp ? new Date(m.timestamp) : now;
                if (entryDate >= sevenDaysAgo) {
                    weeklyTokens += m.estimatedTokens;
                    weeklyAgentTokens[name] = (weeklyAgentTokens[name] || 0) + m.estimatedTokens;
                }
            });

            // Assume $5.00 per 1M tokens average pricing
            const estimatedCost = (totalTokens / 1_000_000) * 5.00;
            const estimatedWeeklyCost = (weeklyTokens / 1_000_000) * 5.00;

            UI.info("OBSERVABILITY & COST DASHBOARD");
            UI.info(`Total Estimated Tokens: ${totalTokens.toLocaleString()}`);
            UI.info(`Total Estimated LLM Cost: $${estimatedCost.toFixed(4)}`);
            UI.info(`Weekly Estimated Tokens (Last 7 days): ${weeklyTokens.toLocaleString()}`);
            UI.info(`Weekly Estimated LLM Cost (Last 7 days): $${estimatedWeeklyCost.toFixed(4)}`);

            if (Object.keys(agentTokens).length > 0) {
                UI.info("Cost Distribution per Agent (Total):");
                Object.entries(agentTokens).forEach(([agent, tokens]) => {
                    const agentCost = (tokens / 1_000_000) * 5.00;
                    process.stdout.write(`  ${chalk.bold(agent.padEnd(12))} : ${tokens.toLocaleString()} tokens ($${agentCost.toFixed(4)})\n`);
                });
            }

            if (Object.keys(weeklyAgentTokens).length > 0) {
                UI.info("Cost Distribution per Agent (Weekly - Last 7 days):");
                Object.entries(weeklyAgentTokens).forEach(([agent, tokens]) => {
                    const agentCost = (tokens / 1_000_000) * 5.00;
                    process.stdout.write(`  ${chalk.bold(agent.padEnd(12))} : ${tokens.toLocaleString()} tokens ($${agentCost.toFixed(4)})\n`);
                });
            }
        } catch (err) {
            logger.debug("Failed to read metrics file", err);
        }
    }

    UI.divider();
}
