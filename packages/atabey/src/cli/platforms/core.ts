import fs from "fs";
import path from "path";
import { MCP } from "../../shared/constants.js";
import { writeJsonFile } from "../utils/fs.js";
import { getPackageRoot } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

import { ADAPTER_CONFIGS, POST_INIT_HANDLERS } from "../../modules/providers/definitions.js";
import type { AdapterConfig, AdapterId } from "../../modules/providers/types.js";

export const ADAPTERS: Record<AdapterId, AdapterConfig> = ADAPTER_CONFIGS;

export const SHIM_FILES = (Object.keys(ADAPTERS) as AdapterId[]).map((id) => ADAPTERS[id].shimFile);

export const FRAMEWORK_DIR_CANDIDATES = [
    ".atabey",
    ".cursor",
    ".claude",
    ".github",
    ".grok",
    ".antigravity",
    ".agent",
    ".gemini/antigravity-cli",
    ".gemini",
    ".agents",
    "antigravity-cli"
] as const;

export function buildMcpServerEntry(projectRoot: string) {
    const packageRoot = getPackageRoot();

    // Check if we are running in the framework local development repository itself
    const isLocalFrameworkDev = path.resolve(packageRoot) === path.resolve(projectRoot);

    let relativePath: string;

    if (isLocalFrameworkDev) {
        // In local framework dev, always use the build path directly relative to project root
        let mcpServerPath = path.join(packageRoot, MCP.SERVER_DIST_PATH);
        if (!fs.existsSync(mcpServerPath)) {
            mcpServerPath = path.join(packageRoot, "../atabey-mcp/dist/index.js");
        }
        if (!fs.existsSync(mcpServerPath)) {
            mcpServerPath = path.join(projectRoot, "node_modules/atabey-mcp/dist/index.js");
        }

        if (!fs.existsSync(mcpServerPath)) {
            UI.warning("  MCP Server not found. Did you run 'npm run build' inside atabey-mcp?");
        }
        relativePath = path.relative(projectRoot, mcpServerPath) || mcpServerPath;
    } else {
        // If we are initializing in a user's project:
        // We target the atabey-mcp package which is a dependency of atabey.
        // This ensures a stable path across different npm/pnpm/yarn setups.
        relativePath = "node_modules/atabey-mcp/dist/index.js";

        // Fallback check if it actually exists in a different location during init
        const localAtabeyPath = path.join(projectRoot, "node_modules/atabey", MCP.SERVER_DIST_PATH);
        if (!fs.existsSync(path.join(projectRoot, relativePath)) && fs.existsSync(localAtabeyPath)) {
            relativePath = path.join("node_modules/atabey", MCP.SERVER_DIST_PATH);
        }
    }

    return {
        command: "node",
        args: [relativePath],
        env: {
            [MCP.PROJECT_ROOT_ENV]: projectRoot,
        },
    };
}

export function runAdapterPostInit(adapter: AdapterConfig, projectRoot: string): void {
    const mcpEntry = buildMcpServerEntry(projectRoot);
    const mcpBlock = { mcpServers: { [MCP.SERVER_NAME]: mcpEntry } };

    const postInitFn = POST_INIT_HANDLERS[adapter.id];
    if (postInitFn) {
        postInitFn(projectRoot, mcpBlock);
    }

    const rootMcpPath = path.join(projectRoot, MCP.ROOT_CONFIG_FILE);
    if (!fs.existsSync(rootMcpPath)) {
        writeJsonFile(rootMcpPath, mcpBlock);
    }
}
