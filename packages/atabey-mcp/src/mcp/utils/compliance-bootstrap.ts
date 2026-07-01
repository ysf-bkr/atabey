import { DataRetention } from "../../shared/retention.js";
import { applyFinOpsRuntimeConfig, budgetManager } from "./finops.js";
import { resolveComplianceConfig, resolveFinOpsConfig } from "./framework-config.js";

let bootstrapped = false;

/**
 * Apply FinOps + KVKK/GDPR retention + consent logging on MCP server boot.
 */
export function bootstrapComplianceServices(projectRoot: string): { finops: boolean; retention: boolean } {
    if (bootstrapped) {
        return { finops: true, retention: true };
    }

    process.env.ATABEY_PROJECT_ROOT = projectRoot;

    const finops = resolveFinOpsConfig(projectRoot);
    const compliance = resolveComplianceConfig(projectRoot);

    const trackingEnabled = finops.tracking || process.env.ATABEY_BUDGET_ENABLED === "true";
    const enforcementEnabled = finops.enforcement && finops.monthlyBudgetUsd > 0;

    applyFinOpsRuntimeConfig({
        ENABLED: trackingEnabled,
        ENFORCE_BLOCKING: enforcementEnabled,
        TEAM: finops.team,
        MONTHLY_BUDGET: enforcementEnabled ? finops.monthlyBudgetUsd : 0,
        AGENT_MAX_BUDGET: finops.agentMaxBudgetUsd > 0 ? finops.agentMaxBudgetUsd : 0,
        ALERT_THRESHOLDS: finops.alertThresholds,
        COST_PER_1K_TOKENS: finops.costPer1kTokensUsd,
    });

    if (trackingEnabled) {
        budgetManager.start();
        process.stderr.write(
            `[atabey-mcp] FinOps ${enforcementEnabled ? "enforcement" : "tracking"} active` +
            (enforcementEnabled ? ` (budget: $${finops.monthlyBudgetUsd}/mo)\n` : "\n"),
        );
    }

    if (compliance.retentionEnabled) {
        DataRetention.initialize();
        process.stderr.write("[atabey-mcp] Data retention cleanup active (KVKK/GDPR)\n");
    }

    if (compliance.consentLogging) {
        process.stderr.write(
            `[atabey-mcp] Consent logging active (basis: ${compliance.dataProcessingBasis})\n`,
        );
    }

    bootstrapped = true;
    return { finops: trackingEnabled, retention: compliance.retentionEnabled };
}

export async function shutdownComplianceServices(): Promise<void> {
    budgetManager.stop();
    DataRetention.shutdown();
    bootstrapped = false;
}