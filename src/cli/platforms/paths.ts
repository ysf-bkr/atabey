import fs from "fs";
import path from "path";
import type { AdapterId } from "../../modules/providers/types.js";
import { ADAPTER_IDS } from "../../modules/providers/types.js";
import {
    LEGACY_AGENT_LAYOUT_BASES,
    UNIFIED_ADAPTER_SLUG,
    UNIFIED_HUB_DIR,
    pathJoin,
    unifiedAdapterPath,
} from "../../shared/constants.js";
import { ADAPTERS } from "./core.js";

export {
    CORE_FRAMEWORK_DIR, UNIFIED_ADAPTER_SLUG, UNIFIED_HUB_DIR
} from "../../shared/constants.js";

export interface AgentsDestination {
    agentsDir: string;
    agentsExt: string;
    nestedAntigravity: boolean;
}

export function unifiedAdapterRoot(aiToolDir: string, adapterId: AdapterId): string {
    return pathJoin(aiToolDir, UNIFIED_ADAPTER_SLUG[adapterId]);
}

export function resolveAgentsDir(
    adapterId: AdapterId,
    isUnified: boolean,
    aiToolDir: string = UNIFIED_HUB_DIR,
): AgentsDestination {
    const adapter = ADAPTERS[adapterId];

    if (!isUnified) {
        return {
            agentsDir: adapter.agentsDir ?? pathJoin(adapter.frameworkDir, "agents"),
            agentsExt: adapter.agentsExt ?? ".md",
            nestedAntigravity: adapterId === "antigravity-cli",
        };
    }

    const base = unifiedAdapterRoot(aiToolDir, adapterId);

    switch (adapterId) {
        case "cursor":
            return { agentsDir: pathJoin(base, "rules"), agentsExt: ".mdc", nestedAntigravity: false };
        case "codex":
            return { agentsDir: pathJoin(base, "instructions"), agentsExt: ".md", nestedAntigravity: false };
        case "antigravity-cli":
            // Antigravity CLI expects workspace agents at .agents/agents/{agent_name}/agent.json
            return { agentsDir: pathJoin(aiToolDir, "agents"), agentsExt: ".json", nestedAntigravity: true };
        default:
            return { agentsDir: pathJoin(base, "agents"), agentsExt: ".md", nestedAntigravity: false };
    }
}

export function getUnifiedAgentLayoutBases(aiToolDir: string = UNIFIED_HUB_DIR): string[] {
    return ADAPTER_IDS.map((id) => resolveAgentsDir(id, true, aiToolDir).agentsDir);
}

const AGENT_INSTRUCTION_CANDIDATES: Array<(name: string) => string[]> = [
    (n) => ADAPTER_IDS.flatMap((id) => {
        const { agentsDir, nestedAntigravity, agentsExt } = resolveAgentsDir(id, true);
        if (nestedAntigravity) {
            return [pathJoin(agentsDir, n, "agent.json"), pathJoin(agentsDir, n, "agent.md")];
        }
        return [pathJoin(agentsDir, `${n}${agentsExt}`)];
    }),
    (n) => LEGACY_AGENT_LAYOUT_BASES.flatMap((base) => {
        if (base.includes("antigravity")) {
            return [pathJoin(base, n, "agent.json"), pathJoin(base, n, "agent.md")];
        }
        const ext = base.includes("rules") ? ".mdc" : ".md";
        return [pathJoin(base, `${n}${ext}`)];
    }),
];

export function findAgentInstruction(projectRoot: string, agentName: string): string | null {
    for (const buildPaths of AGENT_INSTRUCTION_CANDIDATES) {
        for (const rel of buildPaths(agentName)) {
            const full = path.join(projectRoot, rel);
            if (fs.existsSync(full)) return rel;
        }
    }
    return null;
}

export function detectActiveAgentLayouts(projectRoot: string): string[] {
    const unified = getUnifiedAgentLayoutBases()
        .filter((b) => fs.existsSync(path.join(projectRoot, b)));

    const legacy = LEGACY_AGENT_LAYOUT_BASES
        .filter((b) => fs.existsSync(path.join(projectRoot, b)));

    return [...new Set([...unified, ...legacy])];
}

function copyDirectoryRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirectoryRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

export function mirrorUnifiedAgentsToNative(projectRoot: string, adapterId: AdapterId): void {
    const { agentsDir: unifiedDir } = resolveAgentsDir(adapterId, true);
    const nativeRel = ADAPTERS[adapterId].agentsDir;
    if (!nativeRel) return;

    const src = path.join(projectRoot, unifiedDir);
    const dest = path.join(projectRoot, nativeRel);
    if (!fs.existsSync(src) || path.resolve(src) === path.resolve(dest)) return;

    if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
    }
    copyDirectoryRecursive(src, dest);
}

/** Cursor global rule destinations (native + unified hub). */
export function getCursorGlobalRulePaths(projectRoot: string): string[] {
    return [
        path.join(projectRoot, ADAPTERS.cursor.frameworkDir, "rules", "global.mdc"),
        path.join(projectRoot, unifiedAdapterPath(UNIFIED_ADAPTER_SLUG.cursor, "rules", "global.mdc")),
    ];
}
