import fs from "fs";
import path from "path";
import { ALL_AGENTS } from "../../../modules/agents/definitions.js";
import {
    ADAPTERS,
    remapFrameworkContent,
    type AdapterConfig,
    type AdapterId
} from "../../platforms/index.js";
import { SHIM_TEMPLATES } from "../../shims.js";
import { writeJsonFile, writeTextFile } from "../../utils/fs.js";
import { detectProjectKind, resolveProjectPaths } from "../../utils/memory.js";
import { getPackageRoot, getPackageVersion } from "../../utils/pkg.js";

import { TRANSLATIONS, type SupportedLanguage } from "../../utils/i18n.js";
import { UI } from "../../utils/ui.js";

const FRAMEWORK_NAME = "Agent Atabey";

const COLOR_PALETTES = {
    "Modern Blue": { primary: "#0ea5e9", secondary: "#64748b", accent: "#f43f5e" },
    "Enterprise Slate": { primary: "#334155", secondary: "#94a3b8", accent: "#10b981" },
    "Deep Purple": { primary: "#8b5cf6", secondary: "#d8b4fe", accent: "#f59e0b" }
};

function buildProfileServiceConfig(profile: string): {
    finops: Record<string, unknown>;
    compliance: Record<string, unknown>;
} {
    const presets: Record<string, { finops: Record<string, unknown>; compliance: Record<string, unknown> }> = {
        freelancer: {
            finops: { tracking: true, enforcement: false, monthlyBudgetUsd: 0, agentMaxBudgetUsd: 0 },
            compliance: { retentionEnabled: true, consentLogging: true, piiMasking: true, dataProcessingBasis: "legitimate_interest" },
        },
        team: {
            finops: { tracking: true, enforcement: false, monthlyBudgetUsd: 0, agentMaxBudgetUsd: 25 },
            compliance: { retentionEnabled: true, consentLogging: true, piiMasking: true, dataProcessingBasis: "contract" },
        },
        enterprise: {
            finops: { tracking: true, enforcement: true, monthlyBudgetUsd: 500, agentMaxBudgetUsd: 50 },
            compliance: { retentionEnabled: true, consentLogging: true, piiMasking: true, dataProcessingBasis: "consent" },
        },
    };
    return presets[profile] || presets.freelancer;
}

/** Restrict governance authorizedAgents to agents actually scaffolded in this profile. */
function buildGovernanceForAgents(activeAgents: string[]) {
    const allow = (...handles: string[]) => {
        const out = new Set<string>(["@manager"]);
        for (const handle of handles) {
            const name = handle.replace(/^@/, "");
            if (activeAgents.includes(name)) out.add(handle.startsWith("@") ? handle : `@${name}`);
        }
        return Array.from(out);
    };

    return {
        authorizedAgents: {
            SCHEMA_CHANGE: allow("@database", "@architect"),
            BULK_DELETE: ["@manager"],
            ROLE_CHANGE: ["@manager"],
            BILLING_CHANGE: ["@manager"],
            PII_EXPORT: allow("@security"),
            ENV_CHANGE: allow("@devops"),
            PRODUCTION_DEPLOY: allow("@devops"),
            FORCE_PUSH: allow("@git"),
        },
        operationRisk: {
            SCHEMA_CHANGE: 70,
            BULK_DELETE: 90,
            ROLE_CHANGE: 80,
            BILLING_CHANGE: 85,
            PII_EXPORT: 95,
            ENV_CHANGE: 75,
            PRODUCTION_DEPLOY: 80,
            FORCE_PUSH: 60,
        },
    };
}

export function scaffoldConstitution(targetDir: string, frameworkDir: string, adapterId: AdapterId, dryRun: boolean, language: SupportedLanguage = "en") {
    if (dryRun) return;
    const t = TRANSLATIONS[language];
    let content = `# [ATABEY] ${t.constitution_title}\n\nDiscipline and Order.`;
    let readSuccess = false;
    try {
        const templatePath = path.join(getPackageRoot(), "ATABEY.md");
        if (fs.existsSync(templatePath)) {
            content = fs.readFileSync(templatePath, "utf8");
            readSuccess = true;
        }
    } catch (e) {
        UI.warning(`  Failed to read global constitution template: ${e}`);
    }
    content = remapFrameworkContent(content, frameworkDir, adapterId);
    const destPath = path.join(targetDir, frameworkDir, "ATABEY.md");
    writeTextFile(destPath, content);

    UI.success(` Constitution file created inside: ${frameworkDir}/ATABEY.md${readSuccess ? "" : " (default template)"}`);
}

export function scaffoldFrameworkConfigs(
    targetDir: string,
    fDir: string,
    adapter: AdapterConfig,
    dryRun: boolean,
    selectedPalette: string,
    options?: { unified?: boolean; adapters?: string[]; backendLanguage?: string; frontendFramework?: string; language?: SupportedLanguage; profile?: string; agents?: string[] }
) {
    if (dryRun) return;
    const frameworkDir = path.join(targetDir, fDir);
    const palette = COLOR_PALETTES[selectedPalette as keyof typeof COLOR_PALETTES] || COLOR_PALETTES["Modern Blue"];
    // Project policy: generated content language is always English (README is bilingual only).
    const language: SupportedLanguage = "en";
    const t = TRANSLATIONS[language];

    const projectKind = detectProjectKind(targetDir);
    const paths = resolveProjectPaths(targetDir);

    const config = {
        name: FRAMEWORK_NAME,
        version: getPackageVersion(),
        profile: options?.profile || "custom",
        projectKind,
        agents: options?.agents || [],
        unified: options?.unified || false,
        adapters: options?.adapters || [adapter.id],
        paths,
        backendLanguage: options?.backendLanguage || "Node.js (TypeScript)",
        frontendFramework: options?.frontendFramework || "Vite (React)",
        language: language,
        theme: {
            palette: selectedPalette,
            colors: palette
        },
        governance: buildGovernanceForAgents(options?.agents || []),
        orchestrator: {
            autoStart: true,
            intervalMs: 1000,
        },
        ...buildProfileServiceConfig(options?.profile || "custom"),
    };
    writeJsonFile(path.join(frameworkDir, "config.json"), config, dryRun);

    // Scaffold shared-facts.json in memory-graph
    const graphDir = path.join(frameworkDir, "memory-graph");
    if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });
    const sharedFactsPath = path.join(graphDir, "shared-facts.json");
    if (!fs.existsSync(sharedFactsPath)) {
        writeJsonFile(sharedFactsPath, {
            project: FRAMEWORK_NAME,
            initializedAt: new Date().toISOString(),
            stack: [
                options?.backendLanguage || "Node.js (TypeScript)",
                options?.frontendFramework || "Vite (React)"
            ],
            language: language,
            policies: []
        }, dryRun);
    }

    let statusContent = `# [ATABEY] ${t.status_title}\n\n| Agent | State | Active Task | Last Updated | Notes | Extra | Backup |\n|---|---|---|---|---|---|---|\n`;

    const activeAgents = options?.agents && options.agents.length > 0
        ? ALL_AGENTS.filter(a => options.agents!.includes(a.name))
        : ALL_AGENTS;

    const initialStatusJson: Record<string, { state: string; task: string; lastUpdated: string }> = {};
    const now = new Date().toISOString();

    for (const ag of activeAgents) {
        statusContent += "| @" + ag.name + " | " + t.agent_ready + " | Idle | - | - | - | - |\n";
        initialStatusJson[ag.name] = { state: "READY", task: "Idle", lastUpdated: now };
    }
    writeTextFile(path.join(frameworkDir, "STATUS.md"), statusContent);

    // Populate initial status.json
    const statusJsonPath = path.join(frameworkDir, "memory", "status.json");
    if (!fs.existsSync(path.join(frameworkDir, "memory"))) fs.mkdirSync(path.join(frameworkDir, "memory"), { recursive: true });
    writeJsonFile(statusJsonPath, initialStatusJson, dryRun);

    // Initialize specialties directory and files
    const specialtiesDir = path.join(frameworkDir, "memory", "specialties");
    if (!fs.existsSync(specialtiesDir)) fs.mkdirSync(specialtiesDir, { recursive: true });
    for (const ag of activeAgents) {
        const specialtyFilePath = path.join(specialtiesDir, `${ag.name}.md`);
        if (!fs.existsSync(specialtyFilePath)) {
            const initialSpecialtyContent = `# Learned Conventions for @${ag.name}\n\nThis file contains learned behaviors, user feedback, and context-specific rules for the @${ag.name} agent. It is automatically loaded into the agent's system prompt.\n`;
            writeTextFile(specialtyFilePath, initialSpecialtyContent);
        }
    }
}

export function scaffoldShims(
    projectRoot: string,
    coreDir: string,
    adapterId: AdapterId,
    adapter: AdapterConfig,
    dryRun: boolean,
    unified: boolean = false
) {
    for (const [name, content] of Object.entries(SHIM_TEMPLATES)) {
        // Normalize: "antigravity-cli" template key needs exact match or prefix match
        const isSelectedAdapter = name === adapterId ||
            name.toLowerCase() === adapterId.split("-")[0].toLowerCase();

        if (unified || isSelectedAdapter) {
            const shimAdapterId = (unified ? name : adapterId) as AdapterId;
            const shimAdapter = ADAPTERS[shimAdapterId] || adapter;
            const shimContent = remapFrameworkContent(content, coreDir, shimAdapterId);
            const shimFileName = shimAdapter.shimFile || `${name.toUpperCase()}.md`;

            if (!dryRun) writeTextFile(path.join(projectRoot, shimFileName), shimContent);
            if (isSelectedAdapter) {
                UI.success(` Platform shim created: ${shimFileName}`);
            } else if (unified) {
                UI.success(` Unified platform shim added: ${shimFileName}`);
            }
        }
    }
}
