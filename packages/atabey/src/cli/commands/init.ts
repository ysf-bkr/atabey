import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";

import {
    ADAPTER_IDS,
    ADAPTERS,
    mirrorUnifiedAgentsToNative,
    resolveAdapter,
    resolveAgentsDir,
    runAdapterPostInit,
    scaffoldAgents,
    type AdapterId,
} from "../platforms/index.js";
import { ensureDir } from "../utils/fs.js";
import { initializeMemory, resolveProjectPaths } from "../utils/memory.js";
import { getPackageRoot, getPackageVersion, mergePackageJson } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

import { ALL_AGENTS } from "../../modules/agents/definitions.js";
import {
    scaffoldConstitution,
    scaffoldFrameworkConfigs,
    scaffoldShims
} from "./init/scaffold-core.js";
import { scaffoldProjectDocs } from "./init/scaffold-docs.js";
import { scaffoldOps } from "./init/scaffold-ops.js";
import {
    scaffoldSkills,
    scaffoldStandards
} from "./init/scaffold-standards.js";

import { TRANSLATIONS, type SupportedLanguage } from "../utils/i18n.js";

const FRAMEWORK_NAME = "Agent Atabey";

const FRAMEWORK_SUBDIRS = [
    "agents",
    "skills",
    "knowledge",
    "prompts",
    "memory",
    "router",
    "registry",
    "observability",
    "rules",
];

// ─── Profile Definitions ──────────────────────────────────────────────────

const PROFILES: Record<string, { label: string; description: string; agents: string[]; dirs: string[] }> = {
    freelancer: {
        label: "Freelancer / Solo Developer",
        description: "Minimal setup for solo developers (1-3 people)",
        agents: ["manager", "backend", "quality"],
        dirs: ["knowledge", "prompts", "memory", "router"],
    },
    team: {
        label: "Team (5-15 people)",
        description: "Core agents + dashboard for small-medium teams",
        agents: ["manager", "architect", "backend", "frontend", "quality", "database", "security"],
        dirs: ["knowledge", "prompts", "memory", "router", "registry", "observability", "rules"],
    },
    enterprise: {
        label: "Enterprise (15+ people)",
        description: "All 13 agents with full governance and security",
        agents: ALL_AGENTS.map(a => a.name),
        dirs: [...FRAMEWORK_SUBDIRS],
    },
};

export type InitProfile = "freelancer" | "team" | "enterprise";

export function resolveAgentsByFocus(profile: string, focus: string): string[] {
    if (profile === "enterprise") {
        return ALL_AGENTS.map(a => a.name);
    }

    const cleanFocus = focus.toLowerCase().trim();
    if (profile === "freelancer") {
        switch (cleanFocus) {
            case "backend":
                return ["manager", "backend", "quality"];
            case "frontend":
                return ["manager", "frontend", "quality"];
            case "mobile":
                return ["manager", "mobile", "quality"];
            case "mobile-fullstack":
                return ["manager", "backend", "mobile", "quality"];
            case "fullstack":
            default:
                return ["manager", "backend", "frontend", "quality"];
        }
    }

    if (profile === "team") {
        switch (cleanFocus) {
            case "backend":
                return ["manager", "architect", "backend", "quality", "database", "security"];
            case "frontend":
                return ["manager", "architect", "frontend", "quality", "security"];
            case "mobile":
                return ["manager", "architect", "mobile", "quality", "security", "native"];
            case "mobile-fullstack":
                return ["manager", "architect", "backend", "mobile", "quality", "database", "security", "native"];
            case "fullstack":
            default:
                return ["manager", "architect", "backend", "frontend", "quality", "database", "security"];
        }
    }

    return ["manager", "backend", "quality"];
}

/**
 * Checks and cleans up legacy project artifacts.
 */
async function checkAndCleanupLegacy(forceYes: boolean): Promise<void> {
    const home = os.homedir();
    const legacyPaths = [
        path.join(home, ".gemini/antigravity-cli/plugins/agent-enderun"),
        path.join(home, ".gemini/antigravity-cli/plugins/agent-atabey"),
        path.join(home, ".gemini/config/plugins/agent-enderun"),
        path.join(home, ".gemini/config/plugins/agent-atabey"),
    ];

    const existingLegacy = legacyPaths.filter(p => fs.existsSync(p));

    if (existingLegacy.length > 0) {
        UI.warning(`\n[LEGACY] Detected ${existingLegacy.length} legacy project artifact(s).`);

        let shouldCleanup = forceYes;
        if (!forceYes) {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const answer = await new Promise<string>(resolve => rl.question("Clean up legacy files to prevent conflicts? (y/N): ", resolve));
            rl.close();
            shouldCleanup = answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
        }

        if (shouldCleanup) {
            for (const p of existingLegacy) {
                try {
                    fs.rmSync(p, { recursive: true, force: true });
                    UI.success(`  Removed: ${p}`);
                } catch (err) {
                    UI.error(`  Failed to remove ${p}: ${(err as Error).message}`);
                }
            }

            const mcpConfigs = [
                path.join(home, ".gemini/antigravity-cli/mcp.json"),
                path.join(home, ".gemini/antigravity-cli/mcp_config.json")
            ];
            for (const mcp of mcpConfigs) {
                if (fs.existsSync(mcp)) {
                    fs.unlinkSync(mcp);
                    UI.success(`  Reset: ${mcp}`);
                }
            }
        }
    }
}

async function runInteractiveInit(profile?: InitProfile, presetLanguage?: SupportedLanguage): Promise<{ selectedDirs: string[]; selectedAgents: string[]; selectedPalette: string; backendLanguage: string; frontendFramework: string; language: SupportedLanguage }> {
    // If profile is set, skip interactive agent/dir selection
    if (profile) {
        const p = PROFILES[profile];
        process.stdout.write(`\n[PROFILE] ${p.label}\n`);

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

        try {
            let language: SupportedLanguage;
            if (presetLanguage) {
                language = presetLanguage;
                process.stdout.write(`\n[LANG] ${language === "en" ? "English" : "Türkçe"} (from --lang flag)\n`);
            } else {
                process.stdout.write("\n[LANG] Select Framework Language / Dil Seçimi:\n");
                process.stdout.write("1. Türkçe\n");
                process.stdout.write("2. English\n");
                const langInput = await question("\nSelect (1-2) or Enter for 'en': ");
                language = langInput.trim() === "1" ? "tr" : "en";
            }
            const t = TRANSLATIONS[language];

            process.stdout.write(`\n[START] ${t.welcome}\n`);

            // --- Project Focus Question ---
            process.stdout.write("\n[PROJECT FOCUS] Select Project Focus / Proje Odak Noktası:\n");
            process.stdout.write("1. Fullstack (Web UI + Backend API)\n");
            process.stdout.write("2. Backend-Only (API / Services)\n");
            process.stdout.write("3. Frontend-Only (Web UI / SPA)\n");
            process.stdout.write("4. Mobile-Only (Mobile Application)\n");
            process.stdout.write("5. Mobile-Fullstack (Mobile Application + Backend API)\n");
            const focusInput = await question("\nSelect (1-5) or Enter for 'Fullstack': ");
            const projectFocus = focusInput.trim() === "2" ? "backend" :
                focusInput.trim() === "3" ? "frontend" :
                    focusInput.trim() === "4" ? "mobile" :
                        focusInput.trim() === "5" ? "mobile-fullstack" : "fullstack";

            const selectedAgents = resolveAgentsByFocus(profile, projectFocus);
            process.stdout.write(`\n[AGENTS] Selected Agents for ${projectFocus}: ${selectedAgents.join(", ")}\n`);

            let backendLanguage = "Node.js (TypeScript)";
            if (projectFocus !== "frontend" && projectFocus !== "mobile") {
                process.stdout.write(`\n${t.select_backend}:\n`);
                const languages = ["Node.js (TypeScript)", "Go", "Java (Spring Boot)", "Python (FastAPI)", ".NET"];
                languages.forEach((l, i) => process.stdout.write(`${i + 1}. ${l}\n`));
                const bLangInput = await question("\nSelect (1-5) or Enter for \"Node.js\": ");
                backendLanguage = languages[parseInt(bLangInput.trim()) - 1] || "Node.js (TypeScript)";
            }

            let frontendFramework = "Vanilla HTML/JS";
            if (projectFocus !== "backend") {
                process.stdout.write(`\n${t.select_frontend}:\n`);
                const frontendFrameworks = ["Vite (React)", "Next.js (App Router)", "Vanilla HTML/JS"];
                frontendFrameworks.forEach((f, i) => process.stdout.write(`${i + 1}. ${f}\n`));
                const fFrameInput = await question("\nSelect (1-3) or Enter for \"Vite (React)\": ");
                frontendFramework = frontendFrameworks[parseInt(fFrameInput.trim()) - 1] || "Vite (React)";
            }

            process.stdout.write("\n[Available Color Palettes]:\n");
            const palettes = ["Modern Blue", "Enterprise Slate", "Deep Purple"];
            palettes.forEach((p, i) => process.stdout.write(`${i + 1}. ${p}\n`));
            const palInput = await question("\nSelect (1-3) or Enter for \"Modern Blue\": ");
            const selectedPalette = palettes[parseInt(palInput.trim()) - 1] || "Modern Blue";

            return {
                selectedDirs: [...p.dirs],
                selectedAgents,
                selectedPalette,
                backendLanguage,
                frontendFramework,
                language,
            };
        } finally { rl.close(); }
    }

    // Full interactive mode (no profile)
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

    try {
        process.stdout.write("\n[PROFILE] Select a setup profile:\n");
        process.stdout.write("1. Freelancer / Solo Developer (custom focus)\n");
        process.stdout.write("2. Team (5-15 people, custom focus)\n");
        process.stdout.write("3. Enterprise (15+ people, 13 agents)\n");
        process.stdout.write("4. Custom (select everything manually)\n");
        const profileInput = await question("\nSelect (1-4) or Enter for 'Custom': ");
        const selectedProfile = profileInput.trim() || "4";

        if (selectedProfile === "1") {
            return await runInteractiveInit("freelancer");
        }
        if (selectedProfile === "2") {
            return await runInteractiveInit("team");
        }
        if (selectedProfile === "3") {
            return await runInteractiveInit("enterprise");
        }

        process.stdout.write("\n[LANG] Select Framework Language / Dil Seçimi:\n");
        process.stdout.write("1. Türkçe\n");
        process.stdout.write("2. English\n");
        const langInput = await question("\nSelect (1-2) or Enter for 'en': ");
        const language: SupportedLanguage = langInput.trim() === "1" ? "tr" : "en";
        const t = TRANSLATIONS[language];

        process.stdout.write(`\n[START] ${t.welcome}\n`);

        process.stdout.write(`\n${t.select_backend}:\n`);
        const languages = ["Node.js (TypeScript)", "Go", "Java (Spring Boot)", "Python (FastAPI)", ".NET"];
        languages.forEach((l, i) => process.stdout.write(`${i + 1}. ${l}\n`));
        const bLangInput = await question("\nSelect (1-5) or Enter for \"Node.js\": ");
        const backendLanguage = languages[parseInt(bLangInput.trim()) - 1] || "Node.js (TypeScript)";

        process.stdout.write(`\n${t.select_frontend}:\n`);
        const frontendFrameworks = ["Vite (React)", "Next.js (App Router)", "Vanilla HTML/JS"];
        frontendFrameworks.forEach((f, i) => process.stdout.write(`${i + 1}. ${f}\n`));
        const fFrameInput = await question("\nSelect (1-3) or Enter for \"Vite (React)\": ");
        const frontendFramework = frontendFrameworks[parseInt(fFrameInput.trim()) - 1] || "Vite (React)";

        process.stdout.write("\nAvailable Framework Directories:\n");
        FRAMEWORK_SUBDIRS.forEach((d, i) => process.stdout.write(`${i + 1}. ${d}\n`));
        const dirInput = await question(`\n${t.select_dirs} `);
        const selectedDirs = dirInput ? dirInput.split(",").map(n => FRAMEWORK_SUBDIRS[parseInt(n.trim()) - 1]).filter(Boolean) : [...FRAMEWORK_SUBDIRS];

        process.stdout.write("\nAvailable Core Agents:\n");
        ALL_AGENTS.forEach((a, i) => process.stdout.write(`${i + 1}. ${a.name}\n`));
        const agentInput = await question(`\n${t.select_agents} `);
        const selectedAgents = agentInput ? agentInput.split(",").map(n => ALL_AGENTS[parseInt(n.trim()) - 1].name).filter(Boolean) : ALL_AGENTS.map(a => a.name);

        process.stdout.write("\nAvailable Color Palettes:\n");
        const palettes = ["Modern Blue", "Enterprise Slate", "Deep Purple"];
        palettes.forEach((p, i) => process.stdout.write(`${i + 1}. ${p}\n`));
        const palInput = await question(`\n${t.select_palette} `);
        const selectedPalette = palettes[parseInt(palInput.trim()) - 1] || "Modern Blue";

        return { selectedDirs, selectedAgents, selectedPalette, backendLanguage, frontendFramework, language };
    } finally { rl.close(); }
}

export async function initCommand(adapterName: string, options: { unified?: boolean; dryRun?: boolean; yes?: boolean; profile?: InitProfile; focus?: string; language?: SupportedLanguage }) {
    const adapterId = (adapterName || "gemini") as AdapterId;
    const adapter = resolveAdapter(adapterId);

    if (!adapter) {
        UI.error(`Unknown adapter: ${adapterId}`);
        process.exit(1);
    }

    const projectRoot = process.cwd();
    const isUnified = options.unified || false;

    // STRICT ISOLATION STRATEGY
    const coreDir = ".atabey"; // Pure Memory & Knowledge
    const aiToolDir = isUnified ? ".agents" : adapter.frameworkDir; // Pure Agents & Skills

    const dryRun = options.dryRun || false;
    const forceYes = options.yes || false;

    UI.intent("Atabey Initialization", `Bootstrapping ${FRAMEWORK_NAME} (v${getPackageVersion()}) with ${adapterId} adapter...`);

    // Proactive Cleanup of legacy projects
    await checkAndCleanupLegacy(forceYes);

    let selectedDirs: string[];
    let selectedAgents: string[];
    let selectedPalette: string;
    let backendLanguage: string;
    let frontendFramework: string;
    let language: SupportedLanguage;

    if (forceYes) {
        const profile = options.profile || "team";
        const focus = options.focus || "fullstack";
        const p = PROFILES[profile];
        selectedDirs = [...p.dirs];
        selectedAgents = resolveAgentsByFocus(profile, focus);
        selectedPalette = "Modern Blue";
        backendLanguage = "Node.js (TypeScript)";
        frontendFramework = "Vite (React)";
        language = options.language || "en";
        UI.success(`Non-interactive mode: ${profile} profile (${selectedAgents.length} agents, focus: ${focus}, language: ${language}).`);
    } else {
        const result = await runInteractiveInit(options.profile, options.language);
        selectedDirs = result.selectedDirs.filter(d => d !== "agents" && d !== "skills");
        selectedAgents = result.selectedAgents;
        selectedPalette = result.selectedPalette;
        backendLanguage = result.backendLanguage;
        frontendFramework = result.frontendFramework;
        language = result.language;
    }

    const t = TRANSLATIONS[language];

    ensureDir(path.join(projectRoot, coreDir), dryRun);
    selectedDirs.forEach(dir => {
        ensureDir(path.join(projectRoot, coreDir, dir), dryRun);
    });

    ensureDir(path.join(projectRoot, aiToolDir), dryRun);
    if (adapter.nestedDirs) {
        adapter.nestedDirs.forEach(dir => ensureDir(path.join(projectRoot, aiToolDir, dir), dryRun));
    }

    scaffoldConstitution(projectRoot, coreDir, adapterId, dryRun, language);
    scaffoldFrameworkConfigs(projectRoot, coreDir, adapter, dryRun, selectedPalette, {
        unified: isUnified,
        adapters: isUnified ? [...ADAPTER_IDS] : [adapterId],
        backendLanguage,
        frontendFramework,
        language,
        profile: options.profile || (forceYes ? "team" : "custom"),
        agents: selectedAgents,
    });

    scaffoldStandards(path.join(projectRoot, coreDir), dryRun);

    const pathsMap = resolveProjectPaths(projectRoot);

    if (isUnified) {
        for (const id of ADAPTER_IDS) {
            const aid = id as AdapterId;
            const dest = resolveAgentsDir(aid, true, aiToolDir);
            scaffoldAgents(projectRoot, aid, dryRun, selectedAgents, dest.agentsDir, dest.agentsExt, pathsMap, backendLanguage, language);
            if (!dryRun) mirrorUnifiedAgentsToNative(projectRoot, aid);
        }
        UI.success(`[OK] Scaffolding complete for all adapters under ${aiToolDir}/ with native mirrors.`);
    } else {
        const dest = resolveAgentsDir(adapterId, false);
        scaffoldAgents(projectRoot, adapterId, dryRun, selectedAgents, dest.agentsDir, dest.agentsExt, pathsMap, backendLanguage, language);
        UI.success(`[OK] Generated agent definitions under ${dest.agentsDir}/`);
    }

    const skillsBaseDir = path.join(projectRoot, aiToolDir, "skills");
    scaffoldSkills(skillsBaseDir, dryRun);
    scaffoldOps(path.join(projectRoot, coreDir), dryRun);
    scaffoldProjectDocs(projectRoot, { backendLanguage, frontendFramework }, dryRun);
    scaffoldShims(projectRoot, coreDir, adapterId, adapter, dryRun, isUnified);

    if (!dryRun) {
        ensureDir(path.join(projectRoot, coreDir, "messages"));
        ensureDir(path.join(projectRoot, coreDir, "logs"));
        ensureDir(path.join(projectRoot, coreDir, "memory-graph"));
    }

    initializeMemory(path.join(projectRoot, coreDir), dryRun);

    if (!dryRun) {
        const pkgJsonPath = path.join(projectRoot, "package.json");
        const sourcePkgPath = path.join(getPackageRoot(), "package.json");
        mergePackageJson(pkgJsonPath, sourcePkgPath);
    }

    if (isUnified) {
        for (const id of ADAPTER_IDS) {
            runAdapterPostInit(ADAPTERS[id], projectRoot);
        }
    } else {
        runAdapterPostInit(adapter, projectRoot);
    }

    UI.success(`\n[START] ${FRAMEWORK_NAME} (v${getPackageVersion()}) ${t.init_success}`);
    process.stdout.write(`\n- Brain & Memory Hub: ${coreDir}/\n`);
    process.stdout.write(`- AI Agent Commands: ${aiToolDir}/\n`);
    process.stdout.write(`- Profile: ${options.profile || "custom"}\n`);
    process.stdout.write(`\n${t.next_steps}\n`);
    process.stdout.write("  1. Run 'npm install' to install dependencies.\n");
    process.stdout.write("  2. Run 'atabey status' to verify the environment.\n");
    process.stdout.write("  3. Open your AI Assistant (Claude/Gemini/Cursor) and start using @agent commands.\n");
    process.stdout.write("  4. Open your AI Assistant — MCP auto-starts the orchestrator. Optional: 'atabey orchestrate' for TUI.\n");
}
