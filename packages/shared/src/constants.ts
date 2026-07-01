/**
 * Agent Atabey — Single Source of Truth for framework constants.
 * Import from here instead of hardcoding paths, phases, or directory names.
 */

// ─── Framework identity ───────────────────────────────────────────────────────

export const FRAMEWORK = {
    NAME: "Agent Atabey",
    CORE_DIR: ".atabey",
    UNIFIED_HUB_DIR: ".agents",
    CONSTITUTION_FILE: "ATABEY.md",
    DEFAULT_TRACE_ID: "T-000",
    DEFAULT_PHASE: "PHASE_0",
    DEFAULT_MANAGER_STATE: "ACTIVE",
    DASHBOARD_PORT: parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "5858"),
};

export const PROJECT_PHASES = [
    "PHASE_0",
    "PHASE_1",
    "PHASE_2",
    "PHASE_3",
    "PHASE_4",
] as const;

// ─── Adapter platform directories (native / legacy) ───────────────────────────

export const ADAPTER_DIRS = {
    GEMINI: ".gemini",
    CLAUDE: ".claude",
    GROK: ".grok",
    CURSOR: ".cursor",
    CODEX: ".agents",
    ANTIGRAVITY: ".agents",
    LOCAL: ".atabey",
    LEGACY_AGENT: ".agent",
} as const;

/** Priority order for framework directory resolution (CLI + MCP). */
export const FRAMEWORK_DIR_CANDIDATES = [
    FRAMEWORK.CORE_DIR,
    ADAPTER_DIRS.CODEX,
    ADAPTER_DIRS.CLAUDE,
    ADAPTER_DIRS.GEMINI,
    ADAPTER_DIRS.GROK,
    ADAPTER_DIRS.CURSOR,
    ADAPTER_DIRS.ANTIGRAVITY,
    ADAPTER_DIRS.LOCAL,
] as const;

/** Slug under `.agents/{slug}/` for each adapter in unified mode. */
export const UNIFIED_ADAPTER_SLUG = {
    gemini: "gemini",
    claude: "claude",
    grok: "grok",
    cursor: "cursor",
    codex: "codex",
    local: "local",
    "antigravity-cli": "antigravity",
} as const;

export type UnifiedAdapterSlug = keyof typeof UNIFIED_ADAPTER_SLUG;

// ─── Native agent instruction paths (legacy tool compatibility) ───────────────

export const NATIVE_AGENT_PATHS = {
    gemini: pathJoin(ADAPTER_DIRS.GEMINI, "agents"),
    claude: pathJoin(ADAPTER_DIRS.CLAUDE, "agents"),
    grok: pathJoin(ADAPTER_DIRS.GROK, "agents"),
    cursor: pathJoin(ADAPTER_DIRS.CURSOR, "rules"),
    codex: pathJoin(ADAPTER_DIRS.CODEX, "instructions"),
    local: pathJoin(ADAPTER_DIRS.LOCAL, "agents"),
    "antigravity-cli": pathJoin(ADAPTER_DIRS.ANTIGRAVITY, "agents"),
} as const;

/** Legacy layout bases used by `check` and discovery (non-unified installs). */
export const LEGACY_AGENT_LAYOUT_BASES = [
    NATIVE_AGENT_PATHS.gemini,
    NATIVE_AGENT_PATHS.claude,
    NATIVE_AGENT_PATHS.cursor,
    NATIVE_AGENT_PATHS.grok,
    NATIVE_AGENT_PATHS.codex,
    NATIVE_AGENT_PATHS.local,
    NATIVE_AGENT_PATHS["antigravity-cli"],
] as const;

// ─── Framework internal subdirectories (under `.atabey/`) ──────────────────

export const FRAMEWORK_SUBDIRS = {
    AGENTS: "agents",
    SKILLS: "skills",
    KNOWLEDGE: "knowledge",
    PROMPTS: "prompts",
    MEMORY: "memory",
    ROUTER: "router",
    REGISTRY: "registry",
    OBSERVABILITY: "observability",
    RULES: "rules",
    MESSAGES: "messages",
    LOGS: "logs",
    MEMORY_GRAPH: "memory-graph",
    DASHBOARD: "dashboard",
    UI_DIST: "ui",
} as const;

export const CORE_SCAFFOLD_SUBDIRS = [
    FRAMEWORK_SUBDIRS.KNOWLEDGE,
    FRAMEWORK_SUBDIRS.PROMPTS,
    FRAMEWORK_SUBDIRS.MEMORY,
    FRAMEWORK_SUBDIRS.ROUTER,
    FRAMEWORK_SUBDIRS.REGISTRY,
    FRAMEWORK_SUBDIRS.OBSERVABILITY,
    FRAMEWORK_SUBDIRS.RULES,
] as const;

export const RUNTIME_SUBDIRS = [
    FRAMEWORK_SUBDIRS.MESSAGES,
    FRAMEWORK_SUBDIRS.LOGS,
    FRAMEWORK_SUBDIRS.MEMORY_GRAPH,
] as const;

export const MEMORY_SUBDIRS = {
    TASKS: "tasks",
    HISTORY: "history",
} as const;

export const MEMORY_FILES = {
    STATE: "state.json",
    STATUS: "status.json",
    PROJECT_MEMORY: "PROJECT_MEMORY.md",
    SHARED_FACTS: "shared-facts.json",
} as const;

// ─── Monorepo default paths ───────────────────────────────────────────────────

/** Default layout scaffolded into consumer projects after `atabey init`. */
export const DEFAULT_CONSUMER_PATHS = {
    backend: "apps/backend",
    frontend: "apps/web",
    mobile: "apps/mobile",
    docs: "docs",
    tests: "tests",
} as const;

/** Paths inside the Atabey framework source monorepo (not consumer apps/). */
export const FRAMEWORK_MONOREPO_PATHS = {
    backend: "packages/atabey",
    frontend: "packages/atabey-mcp/dashboard",
    mobile: "apps/mobile",
    docs: "docs",
    tests: "packages",
} as const;

/** @deprecated Use DEFAULT_CONSUMER_PATHS */
export const DEFAULT_MONOREPO_PATHS = DEFAULT_CONSUMER_PATHS;

/** Cursor rule globs per agent role (enterprise monorepo layout). */
export const CURSOR_AGENT_GLOBS: Record<string, string> = {
    manager:   "**/*",
    security:  "**/*",
    architect: "**/*",
    backend:   `${DEFAULT_MONOREPO_PATHS.backend}/**/*`,
    frontend:  `${DEFAULT_MONOREPO_PATHS.frontend}/**/*`,
    mobile:    `${DEFAULT_MONOREPO_PATHS.mobile}/**/*`,
    native:    "apps/native/**/*",
    database:  `${DEFAULT_MONOREPO_PATHS.backend}/src/database/**/*`,
    devops:    "{.github,docker,infra,scripts,*.yml,*.yaml,Dockerfile*}",
    quality:   "**/*",
    analyst:   "{docs,specs,contracts}/**/*",
    explorer:  "**/*",
    git:       "**/*",
};

// ─── MCP & environment ──────────────────────────────────────────────────────

export const MCP = {
    SERVER_NAME: "atabey",
    ROOT_CONFIG_FILE: "mcp.json",
    PROJECT_ROOT_ENV: "ATABEY_PROJECT_ROOT",
    TEST_DIR_ENV: "ATABEY_TEST_DIR",
    TRANSPORT_ENV: "MCP_TRANSPORT",
    /** IDE clients (Claude, Cursor, Gemini) spawn MCP via stdio JSON-RPC. */
    TRANSPORT_STDIO: "stdio",
    /** HTTP/SSE unified server for dashboard, multi-session, and remote clients. */
    TRANSPORT_UNIFIED: "unified",
    SERVER_DIST_PATH: "../atabey-mcp/dist/atabey-mcp/src/mcp/index.js",
} as const;

/** Headless Hermes orchestrator (AgentLoop) — auto-starts with MCP server by default. */
export const ORCHESTRATOR = {
    AUTO_START_ENV: "ATABEY_AUTO_START_ORCHESTRATOR",
    INTERVAL_MS_ENV: "ATABEY_ORCHESTRATOR_INTERVAL_MS",
    DEFAULT_AUTO_START: true,
    DEFAULT_INTERVAL_MS: 1000,
} as const;

export const ROOT_CONFIG_FILES = {
    MCP: MCP.ROOT_CONFIG_FILE,
    DOT_MCP: ".mcp.json",
    ENV_EXAMPLE: ".env.example",
    VSCODE_MCP: ".vscode/mcp.json",
} as const;

// ─── Shim template placeholders ───────────────────────────────────────────────

export const TEMPLATE_PLACEHOLDERS = {
    FRAMEWORK_DIR: "{{FRAMEWORK_DIR}}",
    ADAPTER: "{{ADAPTER}}",
    BACKEND_DIR: "{{BACKEND_DIR}}",
    FRONTEND_DIR: "{{FRONTEND_DIR}}",
    DOCS_DIR: "{{DOCS_DIR}}",
    TESTS_DIR: "{{TESTS_DIR}}",
} as const;

// ─── File extensions ─────────────────────────────────────────────────────────

export const AGENT_FILE_EXT = {
    MARKDOWN: ".md",
    CURSOR_RULE: ".mdc",
} as const;

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function pathJoin(...segments: string[]): string {
    return segments.filter(Boolean).join("/");
}

export function corePath(...segments: string[]): string {
    return [FRAMEWORK.CORE_DIR, ...segments.filter(Boolean)].join("/");
}

export function unifiedHubPath(...segments: string[]): string {
    return [FRAMEWORK.UNIFIED_HUB_DIR, ...segments.filter(Boolean)].join("/");
}

export function unifiedAdapterPath(slug: string, ...segments: string[]): string {
    return unifiedHubPath(slug, ...segments);
}

export function knowledgePath(filename: string): string {
    return corePath(FRAMEWORK_SUBDIRS.KNOWLEDGE, filename);
}

/** Backward-compatible aliases */
export const CORE_FRAMEWORK_DIR = FRAMEWORK.CORE_DIR;
export const UNIFIED_HUB_DIR = FRAMEWORK.UNIFIED_HUB_DIR;
export const SKILLS_HUB_PATH = pathJoin(UNIFIED_HUB_DIR, FRAMEWORK_SUBDIRS.SKILLS);
