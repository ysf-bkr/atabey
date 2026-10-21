import fs from "fs";
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
import { scaffoldApp, type FocusKind } from "./init/scaffold-app.js";
import { scaffoldOps } from "./init/scaffold-ops.js";
import {
    BACKEND_LANGUAGES,
    DEFAULT_BACKEND_LANGUAGE,
    DEFAULT_FRONTEND_FRAMEWORK,
    DEFAULT_MOBILE_FRAMEWORK,
    DEFAULT_NATIVE_LANGUAGE,
    FRONTEND_FRAMEWORKS,
    MOBILE_FRAMEWORKS,
    NATIVE_LANGUAGES,
    normalizeBackendLanguage,
    normalizeFrontendFramework,
    normalizeMobileFramework,
    normalizeNativeLanguage,
} from "./init/languages.js";
import {
    scaffoldSkills,
    scaffoldStandards
} from "./init/scaffold-standards.js";

import { TRANSLATIONS, type SupportedLanguage } from "../utils/i18n.js";

const FRAMEWORK_NAME = "Atabey";

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
        description: "Autonomous setup for solo developers with full-stack delivery and security",
        agents: ["manager", "backend", "frontend", "quality", "security"],
        dirs: ["knowledge", "prompts", "memory", "router"],
    },
    team: {
        label: "Team (5-15 people)",
        description: "End-to-end delivery team with analysis, architecture, CI/CD and governance",
        agents: ["manager", "architect", "analyst", "backend", "frontend", "quality", "database", "security", "devops"],
        dirs: ["knowledge", "prompts", "memory", "router", "registry", "observability", "rules"],
    },
    enterprise: {
        label: "Enterprise (15+ people)",
        description: "All 13 agents with full governance, security and platform isolation",
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
                return ["manager", "backend", "quality", "security"];
            case "frontend":
                return ["manager", "frontend", "quality", "security"];
            case "mobile":
                return ["manager", "mobile", "quality", "security"];
            case "mobile-fullstack":
                return ["manager", "backend", "mobile", "quality", "security"];
            case "fullstack":
            default:
                return ["manager", "backend", "frontend", "quality", "security"];
        }
    }

    if (profile === "team") {
        switch (cleanFocus) {
            case "backend":
                return ["manager", "architect", "analyst", "backend", "quality", "database", "security", "devops"];
            case "frontend":
                return ["manager", "architect", "analyst", "frontend", "quality", "security", "devops"];
            case "mobile":
                return ["manager", "architect", "analyst", "mobile", "quality", "security", "native", "devops"];
            case "mobile-fullstack":
                return ["manager", "architect", "analyst", "backend", "mobile", "quality", "database", "security", "native", "devops"];
            case "fullstack":
            default:
                return ["manager", "architect", "analyst", "backend", "frontend", "quality", "database", "security", "devops"];
        }
    }

    return ["manager", "backend", "frontend", "quality", "security"];
}


async function runInteractiveInit(profile?: InitProfile, presetLanguage?: SupportedLanguage): Promise<{ selectedDirs: string[]; selectedAgents: string[]; selectedPalette: string; backendLanguage: string; frontendFramework: string; nativeLanguage: string; mobileFramework?: string; focus: FocusKind; language: SupportedLanguage }> {
    // If profile is set, skip interactive agent/dir selection
    if (profile) {
        const p = PROFILES[profile];
        process.stdout.write(`\n[PROFILE] ${p.label}\n`);

        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

        try {
            // Content language is English-only (project policy). --lang is accepted but ignored for content.
            const language: SupportedLanguage = "en";
            if (presetLanguage && presetLanguage !== "en") {
                process.stdout.write(
                    `\n[LANG] Content language is English only (requested --lang ${presetLanguage} is ignored for generated content).\n`,
                );
            } else {
                process.stdout.write("\n[LANG] Content language: English\n");
            }
            const t = TRANSLATIONS[language];

            process.stdout.write(`\n[START] ${t.welcome}\n`);

            // --- Project Focus Question ---
            process.stdout.write("\n[PROJECT FOCUS] Select Project Focus:\n");
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

            let backendLanguage = DEFAULT_BACKEND_LANGUAGE;
            if (projectFocus !== "frontend" && projectFocus !== "mobile") {
                process.stdout.write(`\n${t.select_backend}:\n`);
                BACKEND_LANGUAGES.forEach((l, i) => process.stdout.write(`${i + 1}. ${l}\n`));
                const bLangInput = await question(`\nSelect (1-${BACKEND_LANGUAGES.length}) or Enter for "${DEFAULT_BACKEND_LANGUAGE}": `);
                backendLanguage = BACKEND_LANGUAGES[parseInt(bLangInput.trim()) - 1] || DEFAULT_BACKEND_LANGUAGE;
            }

            let frontendFramework = "Vanilla HTML/JS";
            if (projectFocus !== "backend") {
                process.stdout.write(`\n${t.select_frontend}:\n`);
                FRONTEND_FRAMEWORKS.forEach((f, i) => process.stdout.write(`${i + 1}. ${f}\n`));
                const fFrameInput = await question(`\nSelect (1-${FRONTEND_FRAMEWORKS.length}) or Enter for "${DEFAULT_FRONTEND_FRAMEWORK}": `);
                frontendFramework = FRONTEND_FRAMEWORKS[parseInt(fFrameInput.trim()) - 1] || DEFAULT_FRONTEND_FRAMEWORK;
            }

            let nativeLanguage = DEFAULT_NATIVE_LANGUAGE;
            process.stdout.write("\n[NATIVE / PLATFORM LAYER] Select the native/platform-tier language (Rust or Go - TypeScript is forbidden here):\n");
            NATIVE_LANGUAGES.forEach((n, i) => process.stdout.write(`${i + 1}. ${n}\n`));
            const nLangInput = await question(`\nSelect (1-${NATIVE_LANGUAGES.length}) or Enter for "${DEFAULT_NATIVE_LANGUAGE}": `);
            nativeLanguage = NATIVE_LANGUAGES[parseInt(nLangInput.trim()) - 1] || DEFAULT_NATIVE_LANGUAGE;

            let mobileFramework = DEFAULT_MOBILE_FRAMEWORK;
            if (projectFocus === "mobile" || projectFocus === "mobile-fullstack") {
                process.stdout.write("\n[MOBILE FRAMEWORK] Select the mobile framework:\n");
                MOBILE_FRAMEWORKS.forEach((m, i) => process.stdout.write(`${i + 1}. ${m}\n`));
                const mInput = await question(`\nSelect (1-${MOBILE_FRAMEWORKS.length}) or Enter for "${DEFAULT_MOBILE_FRAMEWORK}": `);
                mobileFramework = MOBILE_FRAMEWORKS[parseInt(mInput.trim()) - 1] || DEFAULT_MOBILE_FRAMEWORK;
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
                nativeLanguage,
                mobileFramework,
                focus: projectFocus as FocusKind,
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

        process.stdout.write("\n[LANG] Content language: English (project policy — English only outside README)\n");
        const language: SupportedLanguage = "en";
        const t = TRANSLATIONS[language];

        process.stdout.write(`\n[START] ${t.welcome}\n`);

        process.stdout.write(`\n${t.select_backend}:\n`);
        BACKEND_LANGUAGES.forEach((l, i) => process.stdout.write(`${i + 1}. ${l}\n`));
        const bLangInput = await question(`\nSelect (1-${BACKEND_LANGUAGES.length}) or Enter for "${DEFAULT_BACKEND_LANGUAGE}": `);
        const backendLanguage = BACKEND_LANGUAGES[parseInt(bLangInput.trim()) - 1] || DEFAULT_BACKEND_LANGUAGE;

        process.stdout.write(`\n${t.select_frontend}:\n`);
        FRONTEND_FRAMEWORKS.forEach((f, i) => process.stdout.write(`${i + 1}. ${f}\n`));
        const fFrameInput = await question(`\nSelect (1-${FRONTEND_FRAMEWORKS.length}) or Enter for "${DEFAULT_FRONTEND_FRAMEWORK}": `);
        const frontendFramework = FRONTEND_FRAMEWORKS[parseInt(fFrameInput.trim()) - 1] || DEFAULT_FRONTEND_FRAMEWORK;

        process.stdout.write("\n[NATIVE / PLATFORM LAYER] Select the native/platform-tier language (Rust or Go - TypeScript is forbidden here):\n");
        NATIVE_LANGUAGES.forEach((n, i) => process.stdout.write(`${i + 1}. ${n}\n`));
        const nLangInput = await question(`\nSelect (1-${NATIVE_LANGUAGES.length}) or Enter for "${DEFAULT_NATIVE_LANGUAGE}": `);
        const nativeLanguage = NATIVE_LANGUAGES[parseInt(nLangInput.trim()) - 1] || DEFAULT_NATIVE_LANGUAGE;

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

        return { selectedDirs, selectedAgents, selectedPalette, backendLanguage, frontendFramework, nativeLanguage, mobileFramework: DEFAULT_MOBILE_FRAMEWORK, focus: "fullstack", language };
    } finally { rl.close(); }
}

export async function initCommand(adapterName: string, options: { unified?: boolean; dryRun?: boolean; yes?: boolean; profile?: InitProfile; focus?: string; language?: SupportedLanguage; backend?: string; frontend?: string; native?: string; mobile?: string; global?: boolean }) {
    const rawAdapterId = (adapterName || "gemini");
    const adapter = resolveAdapter(rawAdapterId);

    if (!adapter) {
        UI.error(`Unknown adapter: ${rawAdapterId}`);
        process.exit(1);
    }

    const adapterId = adapter.id;

    const projectRoot = process.cwd();
    const isUnified = options.unified ?? true;

    // STRICT ISOLATION STRATEGY
    const coreDir = ".atabey"; // Pure Memory & Knowledge
    const aiToolDir = isUnified ? ".agents" : adapter.frameworkDir; // Pure Agents & Skills

    const dryRun = options.dryRun || false;
    const forceYes = options.yes || false;

    UI.intent("Atabey Initialization", `Bootstrapping ${FRAMEWORK_NAME} (v${getPackageVersion()}) with ${adapterId} adapter...`);


    let selectedDirs: string[];
    let selectedAgents: string[];
    let selectedPalette: string;
    let backendLanguage: string;
    let frontendFramework: string;
    let nativeLanguage: string;
    let mobileFramework: string;
    let language: SupportedLanguage;
    let resolvedFocus: FocusKind;

    if (forceYes) {
        const profile = options.profile || "team";
        const focus = options.focus || "fullstack";
        const p = PROFILES[profile];
        selectedDirs = [...p.dirs];
        selectedAgents = resolveAgentsByFocus(profile, focus);
        selectedPalette = "Modern Blue";
        backendLanguage = normalizeBackendLanguage(options.backend);
        frontendFramework = normalizeFrontendFramework(options.frontend);
        nativeLanguage = normalizeNativeLanguage(options.native);
        mobileFramework = normalizeMobileFramework(options.mobile);
        language = options.language || "en";
        resolvedFocus = focus as FocusKind;
        UI.success(`Non-interactive mode: ${profile} profile (${selectedAgents.length} agents, focus: ${focus}, language: ${language}).`);
        UI.success(`Stack: backend=${backendLanguage}, frontend=${frontendFramework}, mobile=${mobileFramework}, native=${nativeLanguage}.`);
    } else {
        const result = await runInteractiveInit(options.profile, options.language);
        selectedDirs = result.selectedDirs.filter(d => d !== "agents" && d !== "skills");
        selectedAgents = result.selectedAgents;
        selectedPalette = result.selectedPalette;
        backendLanguage = result.backendLanguage;
        frontendFramework = result.frontendFramework;
        nativeLanguage = result.nativeLanguage;
        mobileFramework = result.mobileFramework ?? normalizeMobileFramework(options.mobile);
        language = result.language;
        resolvedFocus = result.focus;
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
        nativeLanguage,
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

    // Generate the real application skeleton under apps/ based on the user's
    // stack selection, unless running inside the framework monorepo itself.
    let isFrameworkRepo = false;
    try {
        const rootPkgPath = path.join(projectRoot, "package.json");
        if (fs.existsSync(rootPkgPath)) {
            const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8")) as { frameworkRepo?: boolean; atabey?: { frameworkRepo?: boolean } };
            isFrameworkRepo = Boolean(rootPkg.frameworkRepo || rootPkg.atabey?.frameworkRepo);
        }
    } catch {
        isFrameworkRepo = false;
    }

    if (!isFrameworkRepo) {
        const appProjectName = path.basename(projectRoot).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "app";
        scaffoldApp(projectRoot, {
            backendLanguage,
            frontendFramework,
            nativeLanguage,
            mobileFramework,
            focus: resolvedFocus,
            projectName: appProjectName,
            projectRoot,
            dryRun,
        });
    }

    if (!dryRun) {
        ensureDir(path.join(projectRoot, coreDir, "messages"));
        ensureDir(path.join(projectRoot, coreDir, "logs"));
        ensureDir(path.join(projectRoot, coreDir, "memory-graph"));
    }

    initializeMemory(path.join(projectRoot, coreDir), dryRun);

    if (!dryRun && !isFrameworkRepo) {
        const pkgJsonPath = path.join(projectRoot, "package.json");
        const sourcePkgPath = path.join(getPackageRoot(), "package.json");
        mergePackageJson(pkgJsonPath, sourcePkgPath);
    }

    if (!dryRun) {
        if (isUnified) {
            for (const id of ADAPTER_IDS) {
                runAdapterPostInit(ADAPTERS[id], projectRoot, { global: options.global });
            }
        } else {
            runAdapterPostInit(adapter, projectRoot, { global: options.global });
        }
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
