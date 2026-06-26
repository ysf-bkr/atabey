/**
 * Adapter-Skill Mapping System
 *
 * Determines which skills each adapter has based on its unique tool capabilities.
 * This way:
 * - Claude Code uses a different skill set
 * - Gemini CLI uses a different skill set
 * - Cursor uses a different skill set
 * - Codex (Copilot) uses a different skill set
 *
 * Bridges each adapter's tool mapping (CLAUDE_TOOL_VALUES, GEMINI_TOOL_VALUES, etc.)
 * with skill definitions.
 */

import type { AdapterId } from "../providers/types.js";

/**
 * Adapter-specific skill configuration
 */
export interface AdapterSkillConfig {
    /** Adapter ID */
    adapterId: AdapterId;
    /** Skills supported by this adapter and which tools they cover */
    enabledSkills: Record<string, {
        /** Skill name for this adapter */
        name: string;
        /** Internal tools covered by this skill */
        tools: string[];
        /** Skill description */
        description: string;
        /** Special rules for this skill in this adapter */
        mandates: string[];
        /** Whether the skill is disabled */
        disabled?: boolean;
    }>;
    /** Adapter's native tool mapping (internal → platform) */
    toolMapping: Record<string, string>;
}

/**
 * Skill configurations for all adapters
 * Each adapter defines its skill set based on platform capabilities.
 */
export const ADAPTER_SKILLS: Record<AdapterId, AdapterSkillConfig> = {
    // ─── Claude Code ────────────────────────────────────────────────
    "claude": {
        adapterId: "claude",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files in the workspace.",
                mandates: [
                    "Use Read for file reading with line range support",
                    "Use Write for creating new files",
                    "Use LS for directory listing"
                ]
            },
            editing: {
                name: "Surgical Code Modification",
                tools: ["replace_text", "batch_surgical_edit", "patch_file"],
                description: "Precise code edits without full file rewrites.",
                mandates: [
                    "Use Edit for single replacements",
                    "Use MultiEdit for batch operations across files"
                ]
            },
            orchestration: {
                name: "Hermes Orchestration & Messaging",
                tools: ["orchestrate_loop", "send_agent_message", "get_framework_status", "log_agent_action"],
                description: "Inter-agent communication and task delegation.",
                mandates: [
                    "Use Task for agent-to-agent messages",
                    "Always include traceId in all messages"
                ]
            },
            governance: {
                name: "Control Plane Governance",
                tools: ["acquire_lock", "release_lock", "register_agent", "update_contract_hash"],
                description: "Resource locking and agent registration.",
                mandates: [
                    "Acquire lock before editing shared resources",
                    "Release lock immediately after write"
                ]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "run_tests", "check_lint"],
                description: "Testing and code quality enforcement.",
                mandates: [
                    "Use Bash for running tests and linting",
                    "Zero-error policy for all quality gates"
                ]
            },
            search: {
                name: "Codebase Search & Exploration",
                tools: ["grep_search", "get_project_map", "get_project_gaps"],
                description: "Search and map the project structure.",
                mandates: [
                    "Use Grep for regex search across codebase",
                    "Use Bash for project map generation"
                ]
            },
            memory: {
                name: "Project Memory Management",
                tools: ["read_project_memory", "update_project_memory", "get_memory_insights",
                    "store_knowledge", "search_knowledge", "delete_knowledge"],
                description: "Centralized project memory and knowledge base.",
                mandates: [
                    "Read PROJECT_MEMORY.md at session start",
                    "Update memory after every significant change"
                ]
            }
        },
        toolMapping: {
            read_file: "Read", write_file: "Write", replace_text: "Edit",
            batch_surgical_edit: "MultiEdit", patch_file: "Edit",
            list_dir: "LS", grep_search: "Grep",
            run_shell_command: "Bash", run_tests: "Bash",
            send_agent_message: "Task", orchestrate_loop: "Task",
            log_agent_action: "Write", ask_human: "Task",
            acquire_lock: "Write", release_lock: "Write",
            register_agent: "Write", update_contract_hash: "Write",
            store_knowledge: "Write", search_knowledge: "Read",
            delete_knowledge: "Write", check_lint: "Bash"
        }
    },

    // ─── Gemini CLI ─────────────────────────────────────────────────
    "gemini": {
        adapterId: "gemini",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files in the workspace.",
                mandates: [
                    "Use read_file with line range for large files",
                    "Use write_file for creating new files"
                ]
            },
            editing: {
                name: "Surgical Code Modification",
                tools: ["replace_text", "patch_file"],
                description: "Precise code edits.",
                mandates: [
                    "Use replace for surgical text replacements",
                    "Prefer surgical edits over full rewrites"
                ]
            },
            orchestration: {
                name: "Agent Orchestration",
                tools: ["orchestrate_loop", "send_agent_message", "get_framework_status"],
                description: "Inter-agent communication.",
                mandates: [
                    "Use run_shell_command for agent messages",
                    "Always include traceId in communications"
                ]
            },
            governance: {
                name: "Control Plane Governance",
                tools: ["acquire_lock", "release_lock", "register_agent"],
                description: "Resource locking and agent registration.",
                mandates: [
                    "Acquire lock before editing shared resources"
                ]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "check_lint"],
                description: "Code quality enforcement.",
                mandates: [
                    "Use run_shell_command for linting and testing"
                ]
            },
            search: {
                name: "Codebase Search",
                tools: ["grep_search", "get_project_map"],
                description: "Search the project structure.",
                mandates: [
                    "Use grep_search for regex search"
                ]
            }
        },
        toolMapping: {
            read_file: "read_file", write_file: "write_file",
            replace_text: "replace", patch_file: "replace",
            list_dir: "list_directory", grep_search: "grep_search",
            run_shell_command: "run_shell_command",
            send_agent_message: "run_shell_command",
            orchestrate_loop: "run_shell_command",
            log_agent_action: "write_file", ask_human: "run_shell_command",
            acquire_lock: "write_file", release_lock: "write_file",
            register_agent: "write_file", check_lint: "run_shell_command"
        }
    },

    // ─── Grok (Gemini-compatible) ───────────────────────────────────
    "grok": {
        adapterId: "grok",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files.",
                mandates: ["Use read_file with line range for large files"]
            },
            editing: {
                name: "Code Modification",
                tools: ["replace_text", "patch_file"],
                description: "Precise code edits.",
                mandates: ["Prefer surgical edits over full rewrites"]
            },
            search: {
                name: "Codebase Search",
                tools: ["grep_search", "get_project_map"],
                description: "Search the project structure.",
                mandates: ["Use grep_search for regex search"]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "check_lint"],
                description: "Code quality enforcement.",
                mandates: ["Use run_shell_command for linting"]
            }
        },
        toolMapping: {
            read_file: "read_file", write_file: "write_file",
            replace_text: "replace", patch_file: "replace",
            list_dir: "list_directory", grep_search: "grep_search",
            run_shell_command: "run_shell_command",
            check_lint: "run_shell_command"
        }
    },

    // ─── Cursor IDE ─────────────────────────────────────────────────
    "cursor": {
        adapterId: "cursor",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files.",
                mandates: ["Use read_file with line range for large files"]
            },
            editing: {
                name: "Code Modification",
                tools: ["replace_text", "patch_file"],
                description: "Precise code edits.",
                mandates: ["Prefer surgical edits over full rewrites"]
            },
            search: {
                name: "Codebase Search",
                tools: ["grep_search", "get_project_map"],
                description: "Search the project structure.",
                mandates: ["Use grep_search for regex search"]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "check_lint"],
                description: "Code quality enforcement.",
                mandates: ["Use run_shell_command for linting"]
            }
        },
        toolMapping: {
            read_file: "read_file", write_file: "write_file",
            replace_text: "replace", patch_file: "replace",
            list_dir: "list_directory", grep_search: "grep_search",
            run_shell_command: "run_shell_command",
            check_lint: "run_shell_command"
        }
    },

    // ─── Codex (GitHub Copilot) ─────────────────────────────────────
    "codex": {
        adapterId: "codex",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files.",
                mandates: ["Use read category tools for file reading"]
            },
            editing: {
                name: "Code Modification",
                tools: ["replace_text", "patch_file", "batch_surgical_edit"],
                description: "Precise code edits.",
                mandates: ["Use write category tools for edits"]
            },
            search: {
                name: "Codebase Search",
                tools: ["grep_search", "get_project_map"],
                description: "Search the project structure.",
                mandates: ["Use read category tools for search"]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "check_lint"],
                description: "Code quality enforcement.",
                mandates: ["Use shell category tools for linting"]
            }
        },
        toolMapping: {
            read_file: "read", write_file: "write",
            replace_text: "write", patch_file: "write",
            batch_surgical_edit: "write",
            list_dir: "read", grep_search: "read",
            run_shell_command: "shell", check_lint: "shell"
        }
    },

    // ─── Local LLM ──────────────────────────────────────────────────
    "local": {
        adapterId: "local",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files.",
                mandates: ["Use read_file with line range for large files"]
            },
            editing: {
                name: "Code Modification",
                tools: ["replace_text", "patch_file"],
                description: "Precise code edits.",
                mandates: ["Prefer surgical edits over full rewrites"]
            },
            orchestration: {
                name: "Agent Orchestration",
                tools: ["orchestrate_loop", "send_agent_message", "get_framework_status"],
                description: "Inter-agent communication.",
                mandates: ["Always include traceId in communications"]
            },
            governance: {
                name: "Control Plane Governance",
                tools: ["acquire_lock", "release_lock", "register_agent"],
                description: "Resource locking.",
                mandates: ["Acquire lock before editing shared resources"]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "check_lint"],
                description: "Code quality enforcement.",
                mandates: ["Use run_shell_command for linting"]
            },
            search: {
                name: "Codebase Search",
                tools: ["grep_search", "get_project_map"],
                description: "Search the project structure.",
                mandates: ["Use grep_search for regex search"]
            }
        },
        toolMapping: {
            read_file: "read_file", write_file: "write_file",
            replace_text: "replace", patch_file: "replace",
            list_dir: "list_directory", grep_search: "grep_search",
            run_shell_command: "run_shell_command",
            send_agent_message: "run_shell_command",
            orchestrate_loop: "run_shell_command",
            log_agent_action: "write_file", ask_human: "run_shell_command",
            acquire_lock: "write_file", release_lock: "write_file",
            register_agent: "write_file", check_lint: "run_shell_command"
        }
    },

    // ─── Antigravity CLI ────────────────────────────────────────────
    "antigravity-cli": {
        adapterId: "antigravity-cli",
        enabledSkills: {
            file_system: {
                name: "File System Mastery",
                tools: ["read_file", "write_file", "list_dir"],
                description: "Read, write, and list files.",
                mandates: ["Use read_file with line range for large files"]
            },
            editing: {
                name: "Code Modification",
                tools: ["replace_text", "patch_file", "batch_surgical_edit"],
                description: "Precise code edits.",
                mandates: ["Prefer surgical edits over full rewrites"]
            },
            orchestration: {
                name: "Agent Orchestration",
                tools: ["orchestrate_loop", "send_agent_message", "get_framework_status"],
                description: "Inter-agent communication.",
                mandates: ["Always include traceId in communications"]
            },
            governance: {
                name: "Control Plane Governance",
                tools: ["acquire_lock", "release_lock", "register_agent"],
                description: "Resource locking.",
                mandates: ["Acquire lock before editing shared resources"]
            },
            quality: {
                name: "Quality Assurance",
                tools: ["run_shell_command", "check_lint"],
                description: "Code quality enforcement.",
                mandates: ["Use run_shell_command for linting"]
            },
            search: {
                name: "Codebase Search",
                tools: ["grep_search", "get_project_map"],
                description: "Search the project structure.",
                mandates: ["Use grep_search for regex search"]
            }
        },
        toolMapping: {
            read_file: "read_file", write_file: "write_file",
            replace_text: "replace", patch_file: "replace",
            batch_surgical_edit: "replace",
            list_dir: "list_directory", grep_search: "grep_search",
            run_shell_command: "run_shell_command",
            send_agent_message: "run_shell_command",
            orchestrate_loop: "run_shell_command",
            log_agent_action: "write_file", ask_human: "run_shell_command",
            acquire_lock: "write_file", release_lock: "write_file",
            register_agent: "write_file", check_lint: "run_shell_command"
        }
    }
};

/**
 * Determines which tools of an agent are available for a specific adapter.
 *
 * @param adapterId - Adapter ID
 * @param agentTools - Agent's defined tool list
 * @returns Filtered tool list (only those supported by the adapter)
 */
export function filterToolsForAdapter(adapterId: AdapterId, agentTools: string[]): string[] {
    const adapterConfig = ADAPTER_SKILLS[adapterId];
    if (!adapterConfig) return agentTools;

    // Collect all tools supported by the adapter
    const supportedTools = new Set<string>();
    for (const skill of Object.values(adapterConfig.enabledSkills)) {
        for (const tool of skill.tools) {
            supportedTools.add(tool);
        }
    }

    // Filter agent tools by what the adapter supports
    return agentTools.filter(tool => supportedTools.has(tool));
}

/**
 * Returns which skills an agent has for a specific adapter.
 *
 * @param adapterId - Adapter ID
 * @param agentTools - Agent's defined tool list
 * @returns Skills the agent has for this adapter
 */
export function getSkillsForAgent(adapterId: AdapterId, agentTools: string[]): Array<{
    name: string;
    description: string;
    tools: string[];
    mandates: string[];
}> {
    const adapterConfig = ADAPTER_SKILLS[adapterId];
    if (!adapterConfig) return [];

    const agentToolSet = new Set(agentTools);
    const matchedSkills: Array<{
        name: string;
        description: string;
        tools: string[];
        mandates: string[];
    }> = [];

    for (const [, skill] of Object.entries(adapterConfig.enabledSkills)) {
        // Add skill if at least one of its tools matches the agent
        const matchingTools = skill.tools.filter(t => agentToolSet.has(t));
        if (matchingTools.length > 0) {
            matchedSkills.push({
                name: skill.name,
                description: skill.description,
                tools: matchingTools,
                mandates: skill.mandates
            });
        }
    }

    return matchedSkills;
}

/**
 * Translates a tool name to its platform-native equivalent for a given adapter.
 *
 * @param adapterId - Adapter ID
 * @param internalToolName - Internal tool name (e.g. "read_file")
 * @returns Platform-native tool name (e.g. "Read" for Claude, "read_file" for Gemini)
 */
export function mapToolToPlatform(adapterId: AdapterId, internalToolName: string): string {
    const adapterConfig = ADAPTER_SKILLS[adapterId];
    if (!adapterConfig) return internalToolName;
    return adapterConfig.toolMapping[internalToolName] || internalToolName;
}
