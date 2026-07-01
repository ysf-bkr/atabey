/**
 * ─── FINOPS / BUDGET ENFORCEMENT ──────────────────────────────────
 *
 * Enterprise budget management for AI token consumption.
 * Enforces strict cost limits per team, agent, or project.
 *
 * Features:
 * - Team-based budget allocation (monthly/quarterly)
 * - Per-agent spending limits
 * - Automatic shutdown when budget exceeded
 * - Central server sync for budget policies
 * - Real-time cost tracking
 * - Budget alerts at configurable thresholds (50%, 80%, 90%, 100%)
 *
 * Architecture:
 *   [Local MCP] → Budget Check → [Enterprise Server] → Shutdown Signal
 *
 * Environment Variables:
 *   ATABEY_BUDGET_TEAM       - Team name for budget grouping
 *   ATABEY_BUDGET_MONTHLY    - Monthly budget in USD (local override)
 *   ATABEY_BUDGET_AGENT_MAX  - Max spend per agent in USD
 *   ATABEY_BUDGET_SYNC_URL   - Enterprise server URL for budget sync
 */

import fs from "fs";
import path from "path";

// ─── Configuration ────────────────────────────────────────────────

interface FinOpsRuntimeConfig {
    TEAM: string;
    MONTHLY_BUDGET: number;
    AGENT_MAX_BUDGET: number;
    SYNC_URL: string;
    SYNC_TOKEN: string;
    ALERT_THRESHOLDS: number[];
    COST_PER_1K_TOKENS: number;
    SYNC_INTERVAL_MS: number;
    /** Track usage and expose metrics */
    ENABLED: boolean;
    /** Block tool calls when budget exceeded */
    ENFORCE_BLOCKING: boolean;
}

function buildDefaultConfig(): FinOpsRuntimeConfig {
    return {
        TEAM: process.env.ATABEY_BUDGET_TEAM || "default",
        MONTHLY_BUDGET: parseFloat(process.env.ATABEY_BUDGET_MONTHLY || "0"),
        AGENT_MAX_BUDGET: parseFloat(process.env.ATABEY_BUDGET_AGENT_MAX || "0"),
        SYNC_URL: process.env.ATABEY_BUDGET_SYNC_URL || "",
        SYNC_TOKEN: process.env.ATABEY_BUDGET_SYNC_TOKEN || "",
        ALERT_THRESHOLDS: (process.env.ATABEY_BUDGET_ALERT_THRESHOLDS || "50,80,90,100")
            .split(",").map(t => parseInt(t.trim(), 10)).filter(t => !isNaN(t)),
        COST_PER_1K_TOKENS: parseFloat(process.env.ATABEY_COST_PER_1K_TOKENS || "0.003"),
        SYNC_INTERVAL_MS: parseInt(process.env.ATABEY_BUDGET_SYNC_INTERVAL || "60000", 10),
        ENABLED: process.env.ATABEY_BUDGET_ENABLED === "true",
        ENFORCE_BLOCKING: process.env.ATABEY_BUDGET_ENABLED === "true" &&
            parseFloat(process.env.ATABEY_BUDGET_MONTHLY || "0") > 0,
    };
}

let CONFIG: FinOpsRuntimeConfig = buildDefaultConfig();

export function applyFinOpsRuntimeConfig(overrides: Partial<FinOpsRuntimeConfig>): void {
    CONFIG = { ...CONFIG, ...overrides };
}

// ─── Types ────────────────────────────────────────────────────────

export interface BudgetState {
    team: string;
    /** Total spend this month in USD */
    monthlySpend: number;
    /** Per-agent spend this month */
    agentSpend: Record<string, number>;
    /** Budget period start (ISO date) */
    periodStart: string;
    /** Budget period end (ISO date) */
    periodEnd: string;
    /** Whether this team/agent is blocked */
    blocked: boolean;
    /** Block reason if blocked */
    blockReason: string | null;
    /** Last alert thresholds triggered */
    triggeredAlerts: number[];
    /** Last sync timestamp */
    lastSync: string | null;
}

interface BudgetPolicy {
    team: string;
    monthlyBudget: number;
    agentMaxBudget: number;
    blocked: boolean;
    blockReason: string | null;
    updatedAt: string;
}

// ─── Budget Manager ───────────────────────────────────────────────

export class BudgetManager {
    private static instance: BudgetManager;
    private state: BudgetState;
    private syncTimer: ReturnType<typeof setInterval> | null = null;
    private localMetricsPath: string;

    private constructor() {
        const now = new Date();
        const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        this.state = {
            team: CONFIG.TEAM,
            monthlySpend: 0,
            agentSpend: {},
            periodStart,
            periodEnd,
            blocked: false,
            blockReason: null,
            triggeredAlerts: [],
            lastSync: null,
        };

        const frameworkDir = process.env.ATABEY_FRAMEWORK_DIR || path.join(process.cwd(), ".atabey");
        this.localMetricsPath = path.join(frameworkDir, "observability", "metrics.json");

        // Load existing state
        this.loadState();
    }

    public static getInstance(): BudgetManager {
        if (!BudgetManager.instance) {
            BudgetManager.instance = new BudgetManager();
        }
        return BudgetManager.instance;
    }

    /**
     * Start the budget manager.
     * Begins periodic sync with enterprise server.
     */
    public start(): void {
        if (!CONFIG.ENABLED) {
            process.stderr.write("[FINOPS] Budget enforcement disabled.\n");
            return;
        }

        process.stderr.write(`[FINOPS] Starting budget manager for team "${CONFIG.TEAM}"\n`);
        if (CONFIG.MONTHLY_BUDGET > 0) {
            process.stderr.write(`[FINOPS] Monthly budget: $${CONFIG.MONTHLY_BUDGET.toFixed(2)}\n`);
        }

        // Periodic sync with enterprise server
        if (CONFIG.SYNC_URL) {
            this.syncTimer = setInterval(() => this.syncWithServer(), CONFIG.SYNC_INTERVAL_MS);
            this.syncWithServer(); // Initial sync
        }

        // Recalculate from local metrics
        this.recalculateFromLocalMetrics();
    }

    /**
     * Stop the budget manager.
     */
    public stop(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        this.saveState();
    }

    /**
     * Record token usage and check budget.
     * Returns error message if budget exceeded, null if allowed.
     */
    public recordUsage(agent: string, tokens: number): string | null {
        if (!CONFIG.ENABLED) return null;

        const cost = (tokens / 1000) * CONFIG.COST_PER_1K_TOKENS;

        // Check if team is blocked
        if (this.state.blocked) {
            return `[FINOPS] ⛔ Budget exceeded: ${this.state.blockReason}`;
        }

        // Update spend
        this.state.monthlySpend += cost;
        this.state.agentSpend[agent] = (this.state.agentSpend[agent] || 0) + cost;

        // Check team budget (blocking only when enforcement enabled)
        if (CONFIG.ENFORCE_BLOCKING && CONFIG.MONTHLY_BUDGET > 0 && this.state.monthlySpend > CONFIG.MONTHLY_BUDGET) {
            this.state.blocked = true;
            this.state.blockReason = `Team "${CONFIG.TEAM}" exceeded monthly budget of $${CONFIG.MONTHLY_BUDGET.toFixed(2)}`;
            this.saveState();
            this.triggerAlert(100);
            return `[FINOPS] ⛔ ${this.state.blockReason}`;
        }

        // Check agent budget (blocking only when enforcement enabled)
        if (CONFIG.ENFORCE_BLOCKING && CONFIG.AGENT_MAX_BUDGET > 0 && (this.state.agentSpend[agent] || 0) > CONFIG.AGENT_MAX_BUDGET) {
            this.state.blocked = true;
            this.state.blockReason = `Agent "${agent}" exceeded max budget of $${CONFIG.AGENT_MAX_BUDGET.toFixed(2)}`;
            this.saveState();
            this.triggerAlert(100);
            return `[FINOPS] ⛔ ${this.state.blockReason}`;
        }

        // Check alert thresholds
        if (CONFIG.MONTHLY_BUDGET > 0) {
            const usagePercent = (this.state.monthlySpend / CONFIG.MONTHLY_BUDGET) * 100;
            for (const threshold of CONFIG.ALERT_THRESHOLDS) {
                if (usagePercent >= threshold && !this.state.triggeredAlerts.includes(threshold)) {
                    this.triggerAlert(threshold);
                    process.stderr.write(`[FINOPS] ⚠️ Budget alert: ${Math.round(usagePercent)}% used ($${this.state.monthlySpend.toFixed(2)} / $${CONFIG.MONTHLY_BUDGET.toFixed(2)})\n`);
                }
            }
        }

        this.saveState();
        return null;
    }

    /**
     * Check if an agent is within budget without recording usage.
     */
    public checkBudget(agent: string): {
        allowed: boolean;
        monthlySpend: number;
        monthlyBudget: number;
        agentSpend: number;
        agentMaxBudget: number;
        usagePercent: number;
        blocked: boolean;
        blockReason: string | null;
    } {
        const agentSpend = this.state.agentSpend[agent] || 0;
        const usagePercent = CONFIG.MONTHLY_BUDGET > 0
            ? (this.state.monthlySpend / CONFIG.MONTHLY_BUDGET) * 100
            : 0;

        return {
            allowed: !this.state.blocked,
            monthlySpend: this.state.monthlySpend,
            monthlyBudget: CONFIG.MONTHLY_BUDGET,
            agentSpend,
            agentMaxBudget: CONFIG.AGENT_MAX_BUDGET,
            usagePercent: Math.round(usagePercent * 100) / 100,
            blocked: this.state.blocked,
            blockReason: this.state.blockReason,
        };
    }

    /**
     * Get full budget state.
     */
    public getState(): BudgetState {
        return { ...this.state };
    }

    /**
     * Reset budget for new period.
     */
    public resetPeriod(): void {
        const now = new Date();
        this.state.monthlySpend = 0;
        this.state.agentSpend = {};
        this.state.periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        this.state.periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
        this.state.blocked = false;
        this.state.blockReason = null;
        this.state.triggeredAlerts = [];
        this.saveState();
        process.stderr.write("[FINOPS] Budget period reset.\n");
    }

    /**
     * Apply a budget policy from the enterprise server.
     */
    public applyPolicy(policy: BudgetPolicy): void {
        if (policy.team !== CONFIG.TEAM) return;

        if (policy.blocked) {
            this.state.blocked = true;
            this.state.blockReason = policy.blockReason || "Blocked by enterprise policy";
            process.stderr.write(`[FINOPS] 🛑 Team "${CONFIG.TEAM}" blocked by enterprise policy: ${this.state.blockReason}\n`);
        }

        this.saveState();
    }

    // ─── Private Methods ───────────────────────────────────────

    /**
     * Sync budget state with enterprise server.
     */
    private async syncWithServer(): Promise<void> {
        if (!CONFIG.SYNC_URL) return;

        try {
            // Send local state to server
            const url = `${CONFIG.SYNC_URL.replace(/\/$/, "")}/api/finops/sync`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${CONFIG.SYNC_TOKEN}`,
                    "X-Team": CONFIG.TEAM,
                },
                body: JSON.stringify({
                    team: this.state.team,
                    monthlySpend: this.state.monthlySpend,
                    agentSpend: this.state.agentSpend,
                    periodStart: this.state.periodStart,
                    periodEnd: this.state.periodEnd,
                }),
            });

            if (response.ok) {
                const policy = (await response.json()) as BudgetPolicy;
                this.applyPolicy(policy);
                this.state.lastSync = new Date().toISOString();
            } else if (response.status === 402) {
                // Payment required – budget exceeded on server side
                const data = (await response.json()) as { reason?: string };
                this.state.blocked = true;
                this.state.blockReason = data.reason || "Budget exceeded on enterprise server";
                process.stderr.write(`[FINOPS] 🛑 Enterprise budget exceeded: ${this.state.blockReason}\n`);
            }
        } catch (error) {
            // Server unreachable – continue with local budget
            process.stderr.write(`[FINOPS] Sync failed (server unreachable): ${error}\n`);
        }
    }

    /**
     * Recalculate spend from local metrics file.
     */
    private recalculateFromLocalMetrics(): void {
        try {
            if (!fs.existsSync(this.localMetricsPath)) return;

            const metrics = JSON.parse(fs.readFileSync(this.localMetricsPath, "utf8")) as Array<{
                timestamp: string;
                agent: string;
                estimatedTokens: number;
            }>;

            const periodStart = new Date(this.state.periodStart);
            const periodEnd = new Date(this.state.periodEnd);

            let totalSpend = 0;
            const agentSpend: Record<string, number> = {};

            for (const entry of metrics) {
                const entryDate = new Date(entry.timestamp);
                if (entryDate >= periodStart && entryDate <= periodEnd) {
                    const cost = (entry.estimatedTokens / 1000) * CONFIG.COST_PER_1K_TOKENS;
                    totalSpend += cost;
                    agentSpend[entry.agent] = (agentSpend[entry.agent] || 0) + cost;
                }
            }

            this.state.monthlySpend = totalSpend;
            this.state.agentSpend = agentSpend;
        } catch { /* ignore */ }
    }

    /**
     * Trigger a budget alert.
     */
    private triggerAlert(threshold: number): void {
        if (!this.state.triggeredAlerts.includes(threshold)) {
            this.state.triggeredAlerts.push(threshold);
        }
    }

    /**
     * Save budget state to disk.
     */
    private saveState(): void {
        try {
            const frameworkDir = process.env.ATABEY_FRAMEWORK_DIR || path.join(process.cwd(), ".atabey");
            const finopsDir = path.join(frameworkDir, "finops");
            if (!fs.existsSync(finopsDir)) {
                fs.mkdirSync(finopsDir, { recursive: true });
            }
            const statePath = path.join(finopsDir, "budget-state.json");
            fs.writeFileSync(statePath, JSON.stringify(this.state, null, 2));
        } catch { /* ignore */ }
    }

    /**
     * Reset the singleton instance (for testing).
     */
    public static resetInstance(): void {
        BudgetManager.instance = undefined as unknown as BudgetManager;
    }

    /**
     * Load budget state from disk.
     */
    private loadState(): void {
        try {
            const frameworkDir = process.env.ATABEY_FRAMEWORK_DIR || path.join(process.cwd(), ".atabey");
            const statePath = path.join(frameworkDir, "finops", "budget-state.json");
            if (fs.existsSync(statePath)) {
                const saved = JSON.parse(fs.readFileSync(statePath, "utf8")) as BudgetState;
                // Only load if same period
                if (saved.periodStart === this.state.periodStart) {
                    this.state = saved;
                }
            }
        } catch { /* ignore */ }
    }
}

// ─── Singleton Export ─────────────────────────────────────────────

export const budgetManager = BudgetManager.getInstance();
export { CONFIG as FinOpsConfig };
