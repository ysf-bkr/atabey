import fs from "fs";
import path from "path";
import { MCP, ORCHESTRATOR } from "../../shared/constants.js";
import { writeJsonFile } from "../utils/fs.js";
import { getPackageRoot } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

import { ADAPTER_CONFIGS, POST_INIT_HANDLERS } from "../../modules/providers/definitions.js";
import type { AdapterConfig, AdapterId } from "../../modules/providers/types.js";

export const ADAPTERS: Record<AdapterId, AdapterConfig> = ADAPTER_CONFIGS;

export const SHIM_FILES = (Object.keys(ADAPTERS) as AdapterId[]).map((id) => ADAPTERS[id].shimFile);

export function buildMcpServerEntry(projectRoot: string) {
    const packageRoot = getPackageRoot();

    // Check if we are running in the framework local development repository itself
    const isLocalFrameworkDev = path.resolve(packageRoot) === path.resolve(projectRoot);

    let relativePath: string;

    if (isLocalFrameworkDev) {
        // In local framework dev, always use the build path directly relative to project root
        let mcpServerPath = path.join(packageRoot, MCP.SERVER_DIST_PATH);
        if (!fs.existsSync(mcpServerPath)) {
            mcpServerPath = path.join(packageRoot, "../atabey-mcp/dist/atabey-mcp/src/mcp/index.js");
        }
        if (!fs.existsSync(mcpServerPath)) {
            mcpServerPath = path.join(projectRoot, "node_modules/atabey-mcp/dist/atabey-mcp/src/mcp/index.js");
        }

        if (!fs.existsSync(mcpServerPath)) {
            UI.warning("  MCP Server not found. Did you run 'npm run build' inside atabey-mcp?");
        }
        relativePath = path.relative(projectRoot, mcpServerPath) || mcpServerPath;

        return {
            command: "node",
            args: [relativePath],
            env: {
                [MCP.PROJECT_ROOT_ENV]: projectRoot,
                [MCP.TRANSPORT_ENV]: MCP.TRANSPORT_STDIO,
                [ORCHESTRATOR.AUTO_START_ENV]: "true",
            },
        };
    } else {
        // In user projects, always emit 'npx -y atabey-mcp'.
        // 1. If installed locally in node_modules, npx executes the local binary immediately with zero network overhead.
        // 2. If not yet installed, npx downloads and runs it safely without MODULE_NOT_FOUND crashes.
        // 3. Fully immune to relative path resolution errors when IDEs start with different working directories.
        return {
            command: "npx",
            args: ["-y", "atabey-mcp"],
            env: {
                [MCP.PROJECT_ROOT_ENV]: projectRoot,
                [MCP.TRANSPORT_ENV]: MCP.TRANSPORT_STDIO,
                [ORCHESTRATOR.AUTO_START_ENV]: "true",
            },
        };
    }
}

/**
 * Adapters whose native project-scope MCP config is the root `.mcp.json`.
 * Only Claude Code reads the portable root file. Codex uses `.codex/config.toml`
 * and VS Code/Copilot uses `.vscode/mcp.json`, so writing `.mcp.json` for them
 * would be a no-op file that looks like a working integration.
 */
const ROOT_MCP_ADAPTERS = new Set<AdapterId>(["claude"]);

/** Stale duplicate MCP config files from older Atabey versions. Removed on re-init. */
const STALE_MCP_CONFIG_FILES = [
    "mcp.json",                       // legacy root config (now `.mcp.json`)
    ".claude/mcp_config.json",
    ".gemini/mcp.json",
    ".gemini/settings.json",
    ".opencode/mcp_config.json",
];

/** Removes duplicate/legacy MCP config files left behind by older layouts.
 *  `.agents/mcp_config.json` (Antigravity) and `.vscode/mcp.json` (VS Code) are
 *  kept — they are native configs for their adapters, not stale duplicates. */
export function removeStaleMcpConfigs(projectRoot: string): void {
    for (const rel of STALE_MCP_CONFIG_FILES) {
        const abs = path.join(projectRoot, rel);
        if (fs.existsSync(abs)) {
            fs.rmSync(abs, { force: true });
            UI.success(`Removed stale MCP config → ${rel}`);
        }
    }
}

/** Writes the canonical MCP block to the project-root `.mcp.json`.
 *  Only refreshed for adapters that natively read it (Claude, Codex) or in
 *  unified (all-AIs) mode — platform-native files own the config otherwise. */
export function writeRootMcpConfig(projectRoot: string, adapterId?: AdapterId): void {
    if (adapterId && !ROOT_MCP_ADAPTERS.has(adapterId)) return;
    const mcpBlock = { mcpServers: { [MCP.SERVER_NAME]: buildMcpServerEntry(projectRoot) } };
    writeJsonFile(path.join(projectRoot, MCP.ROOT_CONFIG_FILE), mcpBlock);
    removeStaleMcpConfigs(projectRoot);
}

export function runAdapterPostInit(
    adapter: AdapterConfig,
    projectRoot: string,
    options: { global?: boolean } = {},
): void {
    const mcpEntry = buildMcpServerEntry(projectRoot);
    const mcpBlock = { mcpServers: { [MCP.SERVER_NAME]: mcpEntry } };

    const postInitFn = POST_INIT_HANDLERS[adapter.id];
    if (postInitFn) {
        postInitFn(projectRoot, mcpBlock, options);
    }

    writeRootMcpConfig(projectRoot, adapter.id);
}
