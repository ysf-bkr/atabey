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
import { updateGitIgnore } from "../utils/fs.js";
import { Storage } from "../../shared/storage.js";
import { initializeMemory, resolveProjectPaths, updateDocumentStore } from "../utils/memory.js";
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
import { importRootDocs } from "./init/import-docs.js";
import { ingestLegacyAiFiles, isExistingProject } from "../utils/onboarding.js";
import { indexCodebase } from "./index-codebase.js";

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

/** Single canonical setup: every specialist, every framework directory. */
const CANONICAL_AGENTS = ALL_AGENTS.map(a => a.name);
const CANONICAL_DIRS = [...FRAMEWORK_SUBDIRS];

/** Adapter keyword that compiles the agent set for every supported AI. */
const ALL_ADAPTERS_KEYWORD = "all";

interface InteractiveSelection {
    selectedPalette: string;
    backendLanguage: string;
    frontendFramework: string;
    nativeLanguage: string;
    mobileFramework: string;
    focus: FocusKind;
}

async function runInteractiveInit(presetLanguage?: SupportedLanguage): Promise<InteractiveSelection> {
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
        process.stdout.write("\n[SETUP] Canonical setup: all 13 role profiles + governance (single setup option).\n");

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

        process.stdout.write("\n[NATIVE / PLATFORM LAYER] Select the native/platform-tier language (Rust or Go - TypeScript is forbidden here):\n");
        NATIVE_LANGUAGES.forEach((n, i) => process.stdout.write(`${i + 1}. ${n}\n`));
        const nLangInput = await question(`\nSelect (1-${NATIVE_LANGUAGES.length}) or Enter for "${DEFAULT_NATIVE_LANGUAGE}": `);
        const nativeLanguage = NATIVE_LANGUAGES[parseInt(nLangInput.trim()) - 1] || DEFAULT_NATIVE_LANGUAGE;

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
            selectedPalette,
            backendLanguage,
            frontendFramework,
            nativeLanguage,
            mobileFramework,
            focus: projectFocus as FocusKind,
        };
    } finally { rl.close(); }
}

export interface InitOptions {
    dryRun?: boolean;
    yes?: boolean;
    focus?: string;
    language?: SupportedLanguage;
    backend?: string;
    frontend?: string;
    native?: string;
    mobile?: string;
    global?: boolean;
    importDocs?: boolean;
    skipIndex?: boolean;
}

export async function initCommand(adapterName: string, options: InitOptions) {
    // `all` compiles for every supported AI; anything else is a single-AI setup.
    const isAll = adapterName === ALL_ADAPTERS_KEYWORD;
    const rawAdapterId = isAll ? "claude" : (adapterName || "claude");
    const adapter = resolveAdapter(rawAdapterId);

    if (!adapter) {
        UI.error(`Unknown AI platform: ${rawAdapterId}. Supported: ${[...ADAPTER_IDS, ALL_ADAPTERS_KEYWORD].join(", ")}`);
        process.exit(1);
    }

    const adapterId = adapter.id;

    const projectRoot = process.cwd();
    const isUnified = isAll;

    // STRICT ISOLATION STRATEGY
    const coreDir = ".atabey"; // Pure Memory & Knowledge
    const aiToolDir = isUnified ? ".agents" : adapter.frameworkDir; // Pure Agents & Skills

    const dryRun = options.dryRun || false;
    const forceYes = options.yes || false;

    UI.intent("Atabey Initialization", `Bootstrapping ${FRAMEWORK_NAME} (v${getPackageVersion()}) for ${isAll ? "all supported AI platforms" : `${adapterId} adapter`}...`);

    let selectedPalette: string;
    let backendLanguage: string;
    let frontendFramework: string;
    let nativeLanguage: string;
    let mobileFramework: string;
    let resolvedFocus: FocusKind;

    if (forceYes) {
        const focus = options.focus || "fullstack";
        selectedPalette = "Modern Blue";
        backendLanguage = normalizeBackendLanguage(options.backend);
        frontendFramework = normalizeFrontendFramework(options.frontend);
        nativeLanguage = normalizeNativeLanguage(options.native);
        mobileFramework = normalizeMobileFramework(options.mobile);
        resolvedFocus = focus as FocusKind;
        UI.success(`Non-interactive mode: canonical setup (${CANONICAL_AGENTS.length} role profiles, focus: ${focus}).`);
        UI.success(`Stack: backend=${backendLanguage}, frontend=${frontendFramework}, mobile=${mobileFramework}, native=${nativeLanguage}.`);
    } else {
        const result = await runInteractiveInit(options.language);
        selectedPalette = result.selectedPalette;
        backendLanguage = result.backendLanguage;
        frontendFramework = result.frontendFramework;
        nativeLanguage = result.nativeLanguage;
        mobileFramework = result.mobileFramework ?? normalizeMobileFramework(options.mobile);
        resolvedFocus = result.focus;
    }

    const selectedDirs = [...CANONICAL_DIRS];
    const selectedAgents = [...CANONICAL_AGENTS];
    const language: SupportedLanguage = "en";
    const t = TRANSLATIONS[language];

    ensureDir(path.join(projectRoot, coreDir), dryRun);
    selectedDirs.forEach(dir => {
        ensureDir(path.join(projectRoot, coreDir, dir), dryRun);
    });

    ensureDir(path.join(projectRoot, aiToolDir), dryRun);
    if (adapter.nestedDirs) {
        adapter.nestedDirs.forEach(dir => ensureDir(path.join(projectRoot, aiToolDir, dir), dryRun));
    }

    // Detect whether we are running inside the framework monorepo itself —
    // consumer-only steps (app skeleton, doc import, package.json merge) skip.
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

    // Brownfield onboarding: absorb pre-existing user-written AI rule files
    // (.cursorrules, a hand-written CLAUDE.md, CONVENTIONS.md, …) into the
    // Atabey knowledge store and remove the scattered originals. This MUST run
    // before scaffolding so Atabey's freshly generated shims are not eaten.
    if (!isFrameworkRepo && !dryRun && isExistingProject(projectRoot)) {
        const ingested = ingestLegacyAiFiles(projectRoot, coreDir, dryRun);
        if (ingested.length > 0) {
            UI.success(`Ingested ${ingested.length} legacy AI rule file(s): ${ingested.join(", ")}`);
        }
    }

    scaffoldConstitution(projectRoot, coreDir, adapterId, dryRun, language);
    scaffoldFrameworkConfigs(projectRoot, coreDir, adapter, dryRun, selectedPalette, {
        unified: isUnified,
        adapters: isUnified ? [...ADAPTER_IDS] : [adapterId],
        backendLanguage,
        frontendFramework,
        nativeLanguage,
        language,
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
    // stack selection (framework monorepo itself is excluded above).
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

    // Open the bootstrap trace (T-001) so PROJECT_MEMORY.md starts with an
    // active task instead of empty tables (constitution RULE 2 / RULE 5).
    if (!dryRun) {
        try {
            const existingTasks = Storage.getTasks();
            if (existingTasks.length === 0) {
                const bootstrapTraceId = "T-001";
                updateDocumentStore("task", {
                    traceId: bootstrapTraceId,
                    description: "Atabey bootstrap: governance layer initialized, knowledge base authoritative.",
                    agent: "manager",
                    priority: "P2",
                    status: "IN_PROGRESS",
                    createdAt: new Date().toISOString(),
                }, bootstrapTraceId, path.join(projectRoot, coreDir));
                Storage.setMetadata("traceId", bootstrapTraceId);
                UI.success("Bootstrap trace T-001 opened (active task initialized in project memory).");
            }
        } catch (e) {
            UI.warning(`Could not open bootstrap trace: ${e}`);
        }
    }

    // Import pre-existing root-level project docs into the Atabey knowledge
    // base so everything stays under Atabey control.
    if (!isFrameworkRepo && !dryRun) {
        await importRootDocs(projectRoot, {
            interactive: !forceYes,
            autoImport: options.importDocs ?? false,
            coreDir,
        });
    }

    if (!dryRun && !isFrameworkRepo) {
        const pkgJsonPath = path.join(projectRoot, "package.json");
        const sourcePkgPath = path.join(getPackageRoot(), "package.json");
        mergePackageJson(pkgJsonPath, sourcePkgPath);

        // Git discipline: compiled platform output + machine-local state are
        // ignored; the brain (.atabey memory/knowledge/constitution) stays
        // committable so the project's shared state is versioned with the code.
        updateGitIgnore(path.join(projectRoot, ".gitignore"), coreDir, dryRun);
    }

    // Automatic codebase indexing — RAG content index (knowledge table) plus
    // the incremental symbol/import graph, so agents can answer "what does
    // this code do / where is X defined" from the DB without re-scanning.
    // Skipped in the framework monorepo (its own packages/* is not consumer
    // app code) and with --skip-index.
    if (!isFrameworkRepo && !dryRun && !options.skipIndex) {
        try {
            UI.success("[RAG] Indexing codebase into Vector Memory + symbol graph...");
            const indexResult = await indexCodebase(projectRoot);
            UI.success(
                `[RAG] Indexed ${indexResult.filesIndexed}/${indexResult.filesFound} files into Core Memory; ` +
                `symbol graph: ${indexResult.graphFiles} files, ${indexResult.graphSymbols} symbols, ${indexResult.graphImports} imports.`
            );
        } catch (e) {
            UI.warning(`[RAG] Automatic indexing skipped: ${e}`);
            UI.warning("[RAG] Run 'atabey index' manually to build the Vector Memory index.");
        }
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
    process.stdout.write(`- Setup: standard (${selectedAgents.length} role profiles${isUnified ? ", all AI platforms" : `, ${adapterId}`})\n`);
    process.stdout.write(`\n${t.next_steps}\n`);
    process.stdout.write("  1. Run 'npm install' to install dependencies.\n");
    process.stdout.write("  2. Run 'atabey status' to verify the environment.\n");
    process.stdout.write("  3. Open your AI Assistant (Claude/Cursor/Codex) and start using @agent commands.\n");
    process.stdout.write("  4. Open your AI Assistant — MCP auto-starts the orchestrator. Optional: 'atabey orchestrate' for TUI.\n");
}
