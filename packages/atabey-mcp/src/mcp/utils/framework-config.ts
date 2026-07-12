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

export interface SandboxConfigSection {
    runtime?: "auto" | "none" | "uid" | "container";
    required?: boolean;
    network?: string;
    image?: string;
    engine?: "auto" | "podman" | "docker";
}

export interface AuthConfigSection {
    /** When true, HTTP/SSE API denies unauthenticated requests (fail closed). */
    required?: boolean;
}

export interface FrameworkConfig {
    profile?: string;
    orchestrator?: { autoStart?: boolean; intervalMs?: number };
    finops?: FinOpsConfigSection;
    compliance?: ComplianceConfigSection;
    /** Phase 1 sandbox settings (enterprise sets required: true). */
    sandbox?: SandboxConfigSection;
    /** Phase 2.1 auth settings (enterprise sets required: true). */
    auth?: AuthConfigSection;
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

const PROFILE_SANDBOX_DEFAULTS: Record<string, SandboxConfigSection> = {
    freelancer: { runtime: "auto", required: false },
    team: { runtime: "auto", required: false },
    enterprise: {
        runtime: "auto",
        required: true,
        network: "none",
        image: "node:20-bookworm-slim",
    },
};

export function resolveSandboxConfig(
    projectRoot: string,
): Required<Pick<SandboxConfigSection, "runtime" | "required">> & SandboxConfigSection {
    const raw = loadFrameworkConfig(projectRoot);
    const profile = raw.profile || "freelancer";
    const defaults = PROFILE_SANDBOX_DEFAULTS[profile] || PROFILE_SANDBOX_DEFAULTS.freelancer;
    const section = raw.sandbox || {};
    return {
        runtime: section.runtime ?? defaults.runtime ?? "auto",
        required: section.required ?? defaults.required ?? false,
        network: section.network ?? defaults.network,
        image: section.image ?? defaults.image,
        engine: section.engine ?? defaults.engine,
    };
}

/**
 * Apply sandbox section from config.json into process.env when env is unset.
 * Explicit environment variables always win.
 */
export function applySandboxEnvFromConfig(projectRoot: string): void {
    const sandbox = resolveSandboxConfig(projectRoot);
    if (!process.env.ATABEY_SANDBOX_RUNTIME) {
        process.env.ATABEY_SANDBOX_RUNTIME = sandbox.runtime;
    }
    if (process.env.ATABEY_SANDBOX_REQUIRED === undefined && sandbox.required) {
        process.env.ATABEY_SANDBOX_REQUIRED = "true";
    }
    if (sandbox.network && !process.env.ATABEY_SANDBOX_NETWORK) {
        process.env.ATABEY_SANDBOX_NETWORK = sandbox.network;
    }
    if (sandbox.image && !process.env.ATABEY_SANDBOX_IMAGE) {
        process.env.ATABEY_SANDBOX_IMAGE = sandbox.image;
    }
    if (sandbox.engine && !process.env.ATABEY_SANDBOX_ENGINE) {
        process.env.ATABEY_SANDBOX_ENGINE = sandbox.engine;
    }
}

const PROFILE_AUTH_DEFAULTS: Record<string, AuthConfigSection> = {
    freelancer: { required: false },
    team: { required: false },
    enterprise: { required: true },
};

export function resolveAuthConfig(projectRoot: string): Required<AuthConfigSection> {
    const raw = loadFrameworkConfig(projectRoot);
    const profile = raw.profile || "freelancer";
    const defaults = PROFILE_AUTH_DEFAULTS[profile] || PROFILE_AUTH_DEFAULTS.freelancer;
    const section = raw.auth || {};
    return {
        required: section.required ?? defaults.required ?? false,
    };
}

/**
 * Apply auth.required from config.json when env not set.
 */
export function applyAuthEnvFromConfig(projectRoot: string): void {
    const auth = resolveAuthConfig(projectRoot);
    if (
        process.env.MCP_AUTH_REQUIRED === undefined &&
        process.env.ATABEY_AUTH_REQUIRED === undefined &&
        auth.required
    ) {
        process.env.MCP_AUTH_REQUIRED = "true";
    }
}
