import path from "path";

/**
 * Agent Atabey — Single Source of Truth for framework constants.
 * Import from here instead of hardcoding paths, phases, or directory names.
 */

// ─── Framework identity ───────────────────────────────────────────────────

export const FRAMEWORK = {
    NAME: "Agent Atabey",
    CORE_DIR: ".atabey",
    // This is the hub for unified adapter layouts (e.g. .agents/gemini, .agents/claude)
    UNIFIED_HUB_DIR: ".agents",
    // This is the default directory to scaffold new apps into
    APPS_DIR: "apps",
    // This is where all skills are stored
    SKILLS_DIR: "skills",
};

export const FRAMEWORK_SUBDIRS = {
    AGENTS: "agents",
    SKILLS: "skills",
    KNOWLEDGE: "knowledge",
    MESSAGES: "messages",
    MEMORY: "memory",
    MEMORY_GRAPH: "memory-graph",
    LOGS: "logs",
    CONFIG: "config",
};

export const ROOT_CONFIG_FILES = {
    MCP: "mcp.json",
    NATIVE_MODULES: "native-modules.json",
    TSCONFIG: "tsconfig.json",
    ESLINT: "eslint.config.js",
};

export const MCP = {
    // Environment variable used by MCP to identify project root
    PROJECT_ROOT_ENV: "ATABEY_PROJECT_ROOT",
    // Environment variable for test mode
    TEST_DIR_ENV: "ATABEY_TEST_DIR",
};

export const MEMORY_FILES = {
    STATE: "state.json",
    SHARED_FACTS: "shared_facts.json",
};

export const NATIVE_AGENT_PATHS = {
    gemini: ".gemini/agents",
    claude: ".claude/agents",
    cursor: ".cursor/rules",
    codex: ".agents/instructions",
    grok: ".grok",
    "antigravity-cli": ".agents/agents",
};

// ─── Backward-compatible aliases ──────────────────────────────────────────

export const CORE_FRAMEWORK_DIR = FRAMEWORK.CORE_DIR;
export const UNIFIED_HUB_DIR = FRAMEWORK.UNIFIED_HUB_DIR;
export const SKILLS_HUB_PATH = pathJoin(UNIFIED_HUB_DIR, FRAMEWORK_SUBDIRS.SKILLS);

// ─── Path Helpers ─────────────────────────────────────────────────────────

function pathJoin(...args: string[]): string {
    return path.join(...args);
}

function corePath(subdir: string, filename: string): string {
    return pathJoin(FRAMEWORK.CORE_DIR, subdir, filename);
}

export function knowledgePath(filename: string): string {
    return corePath(FRAMEWORK_SUBDIRS.KNOWLEDGE, filename);
}
