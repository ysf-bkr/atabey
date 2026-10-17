/**
 * [FINOPS] Enterprise Token Cost & Budget Management Engine
 * Real SQLite-backed token and monetary expenditure tracker.
 * Enforces per-agent and team-wide budget limits with zero mock data.
 */

import { AtabeyStorage } from "../../shared/storage.js";
import { logger } from "../../shared/logger.js";

export interface BudgetState {
    team: string;
    monthlySpend: number;
    monthlyBudget: number;
    budgetLimit: number;
    agentSpend: Record<string, number>;
    periodStart: string;
    periodEnd: string;
    blocked: boolean;
    blockReason: string | null;
    triggeredAlerts: number[];
    lastSync: string | null;
}

export interface AgentBudgetResult {
    allowed: boolean;
    monthlySpend: number;
    monthlyBudget: number;
    agentSpend: number;
    agentMaxBudget: number;
    usagePercent: number;
    blocked: boolean;
    blockReason: string | null;
}

export interface DailyTokenPoint {
    day: string;
    date: string;
    tokens: number;
    cost: number;
    formattedTokens: string;
    formattedCost: string;
}

const DEFAULT_MONTHLY_BUDGET = parseFloat(process.env.ATABEY_BUDGET_MONTHLY || "100.0");
const DEFAULT_AGENT_MAX_BUDGET = parseFloat(process.env.ATABEY_BUDGET_AGENT_MAX || "25.0");
// Standard blended cost heuristic: $0.002 per 1,000 tokens ($2.00 per 1M tokens)
const COST_PER_TOKEN = 0.002 / 1000;

export class FinOpsManager {
    /**
     * Records token usage and monetary cost into SQLite costs table.
     */
    public static recordUsage(params: {
        agent: string;
        tokens: number;
        provider?: string;
        model?: string;
        traceId?: string;
    }): { cost: number; blocked: boolean } {
        const { agent, tokens, provider = "openai", model = "gpt-4o", traceId } = params;
        const cost = Math.max(0, tokens * COST_PER_TOKEN);
        const timestamp = new Date().toISOString();

        try {
            AtabeyStorage.saveCost({
                provider,
                model,
                inputTokens: Math.round(tokens * 0.7),
                outputTokens: Math.round(tokens * 0.3),
                cost: parseFloat(cost.toFixed(6)),
                timestamp,
                traceId,
            });

            // Update agent's cumulative spend in metadata
            const cleanAgent = agent.replace("@", "");
            const metaKey = `finops_agent_spend_${cleanAgent}`;
            const currentSpend = parseFloat(AtabeyStorage.getMetadata(metaKey) || "0");
            AtabeyStorage.setMetadata(metaKey, (currentSpend + cost).toFixed(6));
        } catch (e) {
            logger.error(`[FINOPS] Failed to record usage: ${(e as Error).message}`);
        }

        const state = this.getBudgetState();
        return { cost, blocked: state.blocked };
    }

    /**
     * Computes the live budget state from SQLite. Zero mock data.
     */
    public static getBudgetState(): BudgetState {
        const now = new Date();
        const year = now.getFullYear();

        const firstDay = new Date(year, now.getMonth(), 1).toISOString();
        const lastDay = new Date(year, now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

        const db = AtabeyStorage.getDB();
        
        // Sum total costs for current month
        let monthlySpend: number;
        try {
            const row = db.prepare(`
                SELECT COALESCE(SUM(cost), 0) as total
                FROM costs
                WHERE timestamp >= ? AND timestamp <= ?
            `).get(firstDay, lastDay) as { total: number } | undefined;
            monthlySpend = row?.total ? parseFloat(row.total.toFixed(4)) : 0;
        } catch {
            monthlySpend = 0;
        }

        // Aggregate agent spend
        const agentSpend: Record<string, number> = {};
        try {
            const agents = AtabeyStorage.getAllAgents();
            for (const ag of agents) {
                const cleanName = ag.name.replace("@", "");
                const metaKey = `finops_agent_spend_${cleanName}`;
                const val = parseFloat(AtabeyStorage.getMetadata(metaKey) || "0");
                agentSpend[cleanName] = parseFloat(val.toFixed(4));
            }
        } catch { /* non-fatal */ }

        const monthlyBudget = parseFloat(AtabeyStorage.getMetadata("finops_monthly_budget") || String(DEFAULT_MONTHLY_BUDGET));
        const blocked = monthlySpend >= monthlyBudget;
        const blockReason = blocked ? `Monthly spend ($${monthlySpend.toFixed(2)}) exceeded budget limit ($${monthlyBudget.toFixed(2)})` : null;

        const usageRatio = monthlyBudget > 0 ? (monthlySpend / monthlyBudget) : 0;
        const triggeredAlerts: number[] = [];
        if (usageRatio >= 0.5) triggeredAlerts.push(50);
        if (usageRatio >= 0.75) triggeredAlerts.push(75);
        if (usageRatio >= 0.9) triggeredAlerts.push(90);
        if (usageRatio >= 1.0) triggeredAlerts.push(100);

        return {
            team: "Core Platform",
            monthlySpend,
            monthlyBudget,
            budgetLimit: monthlyBudget,
            agentSpend,
            periodStart: firstDay,
            periodEnd: lastDay,
            blocked,
            blockReason,
            triggeredAlerts,
            lastSync: new Date().toISOString(),
        };
    }

    /**
     * Checks if a specific agent is within its individual budget limit.
     */
    public static checkAgentBudget(agent: string): AgentBudgetResult {
        const state = this.getBudgetState();
        const cleanName = agent.replace("@", "");
        const agentSpend = state.agentSpend[cleanName] || 0;
        const agentMaxBudget = parseFloat(
            AtabeyStorage.getMetadata(`finops_agent_max_${cleanName}`) || String(DEFAULT_AGENT_MAX_BUDGET)
        );

        const agentBlocked = agentSpend >= agentMaxBudget;
        const blocked = state.blocked || agentBlocked;
        const blockReason = state.blocked
            ? state.blockReason
            : agentBlocked
            ? `Agent @${cleanName} reached individual limit ($${agentSpend.toFixed(2)} / $${agentMaxBudget.toFixed(2)})`
            : null;

        const usagePercent = agentMaxBudget > 0 ? Math.min(100, Math.round((agentSpend / agentMaxBudget) * 100)) : 0;

        return {
            allowed: !blocked,
            monthlySpend: state.monthlySpend,
            monthlyBudget: state.monthlyBudget,
            agentSpend,
            agentMaxBudget,
            usagePercent,
            blocked,
            blockReason,
        };
    }

    /**
     * Resets the budget period (clears current spend metadata and logs reset).
     */
    public static resetBudgetPeriod(): void {
        const db = AtabeyStorage.getDB();
        try {
            db.prepare("DELETE FROM metadata WHERE key LIKE 'finops_agent_spend_%'").run();
            AtabeyStorage.setMetadata("finops_last_reset", new Date().toISOString());
            logger.info("[FINOPS] Budget period has been reset.");
        } catch (e) {
            logger.error(`[FINOPS] Failed to reset budget period: ${(e as Error).message}`);
        }
    }

    /**
     * Returns real daily token and cost data for the last N days.
     * Guaranteed zero mock data: if no usage, returns 0 values for each day.
     */
    public static getDailyTokenHistory(days = 7): DailyTokenPoint[] {
        const db = AtabeyStorage.getDB();
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const history: DailyTokenPoint[] = [];

        // Build list of days from (days - 1) days ago to today
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD
            const dayName = dayNames[d.getDay()];

            let tokens = 0;
            let cost = 0;

            try {
                const row = db.prepare(`
                    SELECT 
                        COALESCE(SUM(input_tokens + output_tokens), 0) as totalTokens,
                        COALESCE(SUM(cost), 0) as totalCost
                    FROM costs
                    WHERE timestamp LIKE ?
                `).get(`${dateStr}%`) as { totalTokens: number; totalCost: number } | undefined;

                if (row) {
                    tokens = row.totalTokens || 0;
                    cost = row.totalCost ? parseFloat(row.totalCost.toFixed(4)) : 0;
                }
            } catch {
                tokens = 0;
                cost = 0;
            }

            const formattedTokens = tokens >= 1_000_000
                ? `${(tokens / 1_000_000).toFixed(1)}M`
                : tokens >= 1_000
                ? `${(tokens / 1_000).toFixed(0)}K`
                : `${tokens}`;

            const formattedCost = `$${cost.toFixed(2)}`;

            history.push({
                day: dayName,
                date: dateStr,
                tokens,
                cost,
                formattedTokens,
                formattedCost,
            });
        }

        return history;
    }

    // ─── Budget configuration (per-agent + webhook) ───────────────────

    public static setMonthlyBudget(usd: number): void {
        AtabeyStorage.setMetadata("finops_monthly_budget", String(usd));
    }

    public static setAgentBudget(agent: string, usd: number): void {
        AtabeyStorage.setMetadata(`finops_agent_max_${agent.replace("@", "")}`, String(usd));
    }

    /** Per-agent ceilings (falls back to the default when unset). */
    public static getAgentBudgets(): Record<string, number> {
        const out: Record<string, number> = {};
        try {
            for (const ag of AtabeyStorage.getAllAgents()) {
                const clean = ag.name.replace("@", "");
                out[clean] = parseFloat(
                    AtabeyStorage.getMetadata(`finops_agent_max_${clean}`) || String(DEFAULT_AGENT_MAX_BUDGET),
                );
            }
        } catch { /* non-fatal */ }
        return out;
    }

    public static getWebhookUrl(): string | null {
        return process.env.ATABEY_BUDGET_WEBHOOK || AtabeyStorage.getMetadata("finops_webhook_url") || null;
    }

    public static setWebhookUrl(url: string | null): void {
        if (url && url.trim()) {
            AtabeyStorage.setMetadata("finops_webhook_url", url.trim());
        } else {
            try {
                AtabeyStorage.getDB().prepare("DELETE FROM metadata WHERE key = 'finops_webhook_url'").run();
            } catch { /* ignore */ }
        }
    }

    /** POST a JSON payload to the configured webhook (best-effort, never throws). */
    public static async notifyBudgetWebhook(payload: Record<string, unknown>): Promise<boolean> {
        const url = this.getWebhookUrl();
        if (!url) return false;
        try {
            const { outboundRequest } = await import("atabey-shared/outbound-http.js");
            const res = await outboundRequest({
                url,
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
                timeoutMs: 5000,
            });
            return res.status >= 200 && res.status < 300;
        } catch (e) {
            logger.warn(`[FINOPS] webhook notify failed: ${(e as Error).message}`);
            return false;
        }
    }

    /**
     * Fire webhook alerts for thresholds crossed this month (once per threshold).
     * Returns the thresholds that fired.
     */
    public static async checkAndNotifyBudgets(agent?: string): Promise<number[]> {
        const state = this.getBudgetState();
        const month = state.periodStart.slice(0, 7);
        const fired: number[] = [];
        for (const threshold of state.triggeredAlerts) {
            const key = `finops_alert_${threshold}_${month}`;
            if (AtabeyStorage.getMetadata(key)) continue;
            AtabeyStorage.setMetadata(key, "1");
            fired.push(threshold);
            await this.notifyBudgetWebhook({
                type: "budget_alert",
                threshold,
                monthlySpend: state.monthlySpend,
                monthlyBudget: state.monthlyBudget,
                agent: agent ?? null,
                at: new Date().toISOString(),
            });
        }
        return fired;
    }
}
