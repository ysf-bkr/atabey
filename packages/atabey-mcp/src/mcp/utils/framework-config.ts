import fs from "fs";
import path from "path";

export interface FinOpsConfigSection {
    tracking?: boolean;
    enforcement?: boolean;
    monthlyBudgetUsd?: number;
    agentMaxBudgetUsd?: number;
    team?: string;
    alertThresholds?: number[];
    costPer1kTokensUsd?: number;
}

export interface ComplianceConfigSection {
    retentionEnabled?: boolean;
    consentLogging?: boolean;
    piiMasking?: boolean;
    dataProcessingBasis?: "consent" | "legitimate_interest" | "contract";
}

export interface FrameworkConfig {
    profile?: string;
    orchestrator?: { autoStart?: boolean; intervalMs?: number };
    finops?: FinOpsConfigSection;
    compliance?: ComplianceConfigSection;
}

const PROFILE_FINOPS_DEFAULTS: Record<string, FinOpsConfigSection> = {
    freelancer: {
        tracking: true,
        enforcement: false,
        monthlyBudgetUsd: 0,
        agentMaxBudgetUsd: 0,
    },
    team: {
        tracking: true,
        enforcement: false,
        monthlyBudgetUsd: 0,
        agentMaxBudgetUsd: 25,
    },
    enterprise: {
        tracking: true,
        enforcement: true,
        monthlyBudgetUsd: 500,
        agentMaxBudgetUsd: 50,
    },
};

const PROFILE_COMPLIANCE_DEFAULTS: Record<string, ComplianceConfigSection> = {
    freelancer: {
        retentionEnabled: true,
        consentLogging: true,
        piiMasking: true,
        dataProcessingBasis: "legitimate_interest",
    },
    team: {
        retentionEnabled: true,
        consentLogging: true,
        piiMasking: true,
        dataProcessingBasis: "contract",
    },
    enterprise: {
        retentionEnabled: true,
        consentLogging: true,
        piiMasking: true,
        dataProcessingBasis: "consent",
    },
};

export function loadFrameworkConfig(projectRoot: string): FrameworkConfig {
    const configPath = path.join(projectRoot, ".atabey", "config.json");
    if (!fs.existsSync(configPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(configPath, "utf8")) as FrameworkConfig;
    } catch {
        return {};
    }
}

export function resolveFinOpsConfig(projectRoot: string): Required<FinOpsConfigSection> {
    const raw = loadFrameworkConfig(projectRoot);
    const profile = raw.profile || "freelancer";
    const profileDefaults = PROFILE_FINOPS_DEFAULTS[profile] || PROFILE_FINOPS_DEFAULTS.freelancer;
    const section = raw.finops || {};

    return {
        tracking: section.tracking ?? profileDefaults.tracking ?? true,
        enforcement: section.enforcement ?? profileDefaults.enforcement ?? false,
        monthlyBudgetUsd: section.monthlyBudgetUsd ?? profileDefaults.monthlyBudgetUsd ?? 0,
        agentMaxBudgetUsd: section.agentMaxBudgetUsd ?? profileDefaults.agentMaxBudgetUsd ?? 0,
        team: section.team ?? (process.env.ATABEY_BUDGET_TEAM || "default"),
        alertThresholds: section.alertThresholds ?? [50, 80, 90, 100],
        costPer1kTokensUsd: section.costPer1kTokensUsd ?? 0.003,
    };
}

export function resolveComplianceConfig(projectRoot: string): Required<ComplianceConfigSection> {
    const raw = loadFrameworkConfig(projectRoot);
    const profile = raw.profile || "freelancer";
    const profileDefaults = PROFILE_COMPLIANCE_DEFAULTS[profile] || PROFILE_COMPLIANCE_DEFAULTS.freelancer;
    const section = raw.compliance || {};

    return {
        retentionEnabled: section.retentionEnabled ?? profileDefaults.retentionEnabled ?? true,
        consentLogging: section.consentLogging ?? profileDefaults.consentLogging ?? true,
        piiMasking: section.piiMasking ?? profileDefaults.piiMasking ?? true,
        dataProcessingBasis: section.dataProcessingBasis ?? profileDefaults.dataProcessingBasis ?? "legitimate_interest",
    };
}