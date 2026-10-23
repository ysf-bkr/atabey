import fs from "fs";
import path from "path";

import {
    ADAPTERS,
    resolveAdapter,
    resolveAgentsDir,
    runAdapterPostInit,
    scaffoldAgents,
    type AdapterId,
} from "../platforms/index.js";
import { ALL_AGENTS } from "../../modules/agents/definitions.js";
import {
    scaffoldConstitution,
    scaffoldFrameworkConfigs,
    scaffoldShims,
} from "./init/scaffold-core.js";
import { scaffoldOps } from "./init/scaffold-ops.js";
import { scaffoldSkills, scaffoldStandards } from "./init/scaffold-standards.js";
import { resolveProjectPaths } from "../utils/memory.js";
import { getPackageVersion } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";
import { updateGitIgnore } from "../utils/fs.js";

interface ExistingConfig {
    version?: string;
    setup?: string;
    unified?: boolean;
    adapters?: string[];
    agents?: string[];
    backendLanguage?: string;
    frontendFramework?: string;
    nativeLanguage?: string;
    theme?: { palette?: string };
}

/**
 * `atabey update` — non-destructive scaffold refresh after a package upgrade.
 *
 * Regenerates everything that is COMPILED OUTPUT (constitution, standards,
 * agent definitions, skills, shims, platform MCP configs, gitignore rules)
 * from the newly installed package version while PRESERVING the project's
 * living state:
 *   - `.atabey/memory/**` (project memory, specialty memory)
 *   - `.atabey/knowledge/imported/**` (imported project docs)
 *   - `.atabey/permission-matrix.json` (RBAC customizations)
 *   - `.atabey/auth.key` (HTTP/SSE API token)
 *
 * Unlike `init`, update never scaffolds the app skeleton, never re-runs
 * brownfield ingestion or doc import, and never prompts.
 */
export async function updateCommand(): Promise<void> {
    const projectRoot = process.cwd();
    const coreDir = ".atabey";
    const configPath = path.join(projectRoot, coreDir, "config.json");

    UI.intent("Atabey Update", `Refreshing governance scaffold (v${getPackageVersion()})...`);

    if (!fs.existsSync(configPath)) {
        UI.error("No Atabey project found (missing .atabey/config.json).");
        UI.error("Run 'atabey init <ai>' first; 'update' only refreshes existing projects.");
        process.exitCode = 1;
        return;
    }

    let config: ExistingConfig;
    try {
        config = JSON.parse(fs.readFileSync(configPath, "utf8")) as ExistingConfig;
    } catch (e) {
        UI.error(`Cannot read ${configPath}: ${e}`);
        process.exitCode = 1;
        return;
    }

    const oldVersion = config.version || "unknown";
    const isUnified = config.unified === true;
    const adapterId = (config.adapters?.[0] || "claude") as AdapterId;
    const adapter = ADAPTERS[adapterId] || resolveAdapter(adapterId);
    const agents = (config.agents && config.agents.length > 0) ? config.agents : ALL_AGENTS.map(a => a.name);
    const backendLanguage = config.backendLanguage || "Node.js (TypeScript)";
    const frontendFramework = config.frontendFramework || "Vite (React)";
    const nativeLanguage = config.nativeLanguage || "Rust";
    const palette = config.theme?.palette || "Modern Blue";

    if (oldVersion !== getPackageVersion()) {
        UI.success(`Scaffold version: ${oldVersion} → ${getPackageVersion()}`);
    } else {
        UI.success(`Scaffold version: ${getPackageVersion()} (already current — regenerating anyway).`);
    }

    // ── Regenerate compiled output ─────────────────────────────────────────
    scaffoldConstitution(projectRoot, coreDir, adapterId, false, "en");
    scaffoldFrameworkConfigs(projectRoot, coreDir, adapter, false, palette, {
        unified: isUnified,
        adapters: isUnified ? (config.adapters ?? []) : [adapterId],
        backendLanguage,
        frontendFramework,
        nativeLanguage,
        language: "en",
        agents,
    });
    scaffoldStandards(path.join(projectRoot, coreDir), false);

    const pathsMap = resolveProjectPaths(projectRoot);

    if (isUnified) {
        const aiToolDir = ".agents";
        for (const id of (config.adapters ?? []) as AdapterId[]) {
            const dest = resolveAgentsDir(id, true, aiToolDir);
            scaffoldAgents(projectRoot, id, false, agents, dest.agentsDir, dest.agentsExt, pathsMap, backendLanguage, "en");
        }
        UI.success(`[OK] Agent definitions refreshed for ${config.adapters?.length ?? 0} adapters under ${aiToolDir}/.`);
    } else {
        const dest = resolveAgentsDir(adapterId, false);
        scaffoldAgents(projectRoot, adapterId, false, agents, dest.agentsDir, dest.agentsExt, pathsMap, backendLanguage, "en");
        UI.success(`[OK] Agent definitions refreshed under ${dest.agentsDir}/`);
    }

    const aiToolDir = isUnified ? ".agents" : adapter.frameworkDir;
    scaffoldSkills(path.join(projectRoot, aiToolDir, "skills"), false);
    scaffoldOps(path.join(projectRoot, coreDir), false);
    scaffoldShims(projectRoot, coreDir, adapterId, adapter, false, isUnified);
    updateGitIgnore(path.join(projectRoot, ".gitignore"), coreDir, false);

    // ── Refresh platform MCP configs (portable npx launcher, single file per platform)
    if (isUnified) {
        for (const id of (config.adapters ?? []) as AdapterId[]) {
            if (ADAPTERS[id]) runAdapterPostInit(ADAPTERS[id], projectRoot);
        }
    } else {
        runAdapterPostInit(adapter, projectRoot);
    }

    UI.success(`\n[OK] Atabey scaffold updated to v${getPackageVersion()}.`);
    process.stdout.write("\nPreserved (never touched by update):\n");
    process.stdout.write("  - .atabey/memory/** (project + specialty memory)\n");
    process.stdout.write("  - .atabey/knowledge/imported/** (imported docs)\n");
    process.stdout.write("  - .atabey/permission-matrix.json (RBAC)\n");
    process.stdout.write("  - .atabey/auth.key (API token)\n");
    process.stdout.write("\nNext: run 'atabey check' to verify, 'atabey index' to refresh the RAG index.\n");
}
