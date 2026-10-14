/**
 * ─── DYNAMIC TOOL PROFILES & FILTERING ENGINE ───────────────────────
 *
 * Prevents LLM context saturation, tool selection confusion, and hallucination,
 * especially for Local LLMs (Ollama, LM Studio, vLLM) and low-parameter models.
 *
 * Supported Profiles:
 * - full / all: All tools enabled (default for Claude 3.7, GPT-4o, Gemini 2.0).
 * - essential / local_llm / compact: Top 10 core tools for local LLMs.
 * - coding: Code editing, inspection, search, tests, and linting tools.
 * - readonly / audit: Non-mutating inspection, memory, and compliance tools.
 */

import { detectProvider } from "../utils/context-optimizer.js";

export type ToolProfileType = "full" | "all" | "essential" | "local_llm" | "compact" | "coding" | "readonly" | "audit";

export const ESSENTIAL_TOOLS = new Set([
    "read_file",
    "write_file",
    "replace_text",
    "list_dir",
    "grep_search",
    "run_shell_command",
    "run_tests",
    "check_lint",
    "get_framework_status",
    "send_agent_message",
]);

export const CODING_TOOLS = new Set([
    ...ESSENTIAL_TOOLS,
    "patch_file",
    "batch_surgical_edit",
    "get_project_map",
    "get_project_gaps",
    "analyze_code_quality",
]);

export const READONLY_TOOLS = new Set([
    "read_file",
    "list_dir",
    "grep_search",
    "get_project_map",
    "get_project_gaps",
    "run_tests",
    "check_lint",
    "analyze_code_quality",
    "check_architecture_compliance",
    "get_system_health",
    "get_framework_status",
    "read_project_memory",
    "get_memory_insights",
]);

export interface FilterOptions {
    profile?: string;
    allowed?: string[];
    disabled?: string[];
    clientName?: string;
}

export interface MCPToolItem {
    name: string;
    description?: string;
    inputSchema?: unknown;
}

/**
 * Resolves the active tool profile based on explicit options, client detection,
 * or environment variables.
 */
export function resolveActiveProfile(options?: FilterOptions): ToolProfileType {
    if (options?.profile) {
        return options.profile.toLowerCase() as ToolProfileType;
    }

    if (process.env.ATABEY_TOOL_PROFILE) {
        return process.env.ATABEY_TOOL_PROFILE.toLowerCase() as ToolProfileType;
    }

    if (options?.clientName) {
        const provider = detectProvider(options.clientName);
        if (provider === "local") {
            return "local_llm";
        }
    }

    return "full";
}

/**
 * Filters a list of MCP tools based on active profile, allowed list, and disabled list.
 */
export function filterTools<T extends MCPToolItem>(tools: T[], options?: FilterOptions): T[] {
    const profile = resolveActiveProfile(options);

    // Environment variable overrides
    const envAllowed = process.env.ATABEY_ALLOWED_TOOLS
        ? process.env.ATABEY_ALLOWED_TOOLS.split(",").map((s) => s.trim().toLowerCase())
        : null;

    const envDisabled = process.env.ATABEY_DISABLED_TOOLS
        ? new Set(process.env.ATABEY_DISABLED_TOOLS.split(",").map((s) => s.trim().toLowerCase()))
        : new Set<string>();

    const explicitAllowed = options?.allowed ? options.allowed.map((s) => s.toLowerCase()) : null;
    const explicitDisabled = options?.disabled ? new Set(options.disabled.map((s) => s.toLowerCase())) : new Set<string>();

    return tools.filter((tool) => {
        const toolName = tool.name.toLowerCase();

        // Check disabled lists first
        if (envDisabled.has(toolName) || explicitDisabled.has(toolName)) {
            return false;
        }

        // Check explicit allowed lists
        if (explicitAllowed && !explicitAllowed.includes(toolName)) {
            return false;
        }
        if (envAllowed && !envAllowed.includes(toolName)) {
            return false;
        }

        // Apply profile filters
        switch (profile) {
            case "essential":
            case "local_llm":
            case "compact":
                return ESSENTIAL_TOOLS.has(toolName);
            case "coding":
                return CODING_TOOLS.has(toolName);
            case "readonly":
            case "audit":
                return READONLY_TOOLS.has(toolName);
            case "full":
            case "all":
            default:
                return true;
        }
    });
}
