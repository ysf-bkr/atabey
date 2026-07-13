// ─────────────────────────────────────────────────────────────────────────────
//  Atabey AL — Agent Registry
//  Atabey Order v2 · Structured AgentDefinition schema
//
//  VALID FRONTMATTER FIELDS per platform:
//  ┌───────────────┬────────────────────────────────────────────────────────────┐
//  │ gemini-cli    │ name, description, model, tools (YAML list)                │
//  │ claude-code   │ name, description, model, tools (inline array), color      │
//  │ cursor        │ description, globs, alwaysApply                            │
//  │ codex-cli     │ agent-type, display-name, when-to-use, model, allowed-tools│
//  │ antigravity   │ JSON — customAgentSpec schema                              │
//  └───────────────┴────────────────────────────────────────────────────────────┘
//  Custom fields (capability, tags, tier) are Atabey-internal metadata and
//  must NOT appear in any platform frontmatter.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../../cli/utils/memory.js";
import { getPackageRoot } from "../../cli/utils/pkg.js";
import { CURSOR_AGENT_GLOBS } from "../../shared/constants.js";
import { logger } from "../../shared/logger.js";
import { AgentDefinition } from "./types.js";

// Import individual agent definitions
import { analyst } from "./registry/analyst.js";
import { architect } from "./registry/architect.js";
import { backend } from "./registry/backend.js";
import { database } from "./registry/database.js";
import { devops } from "./registry/devops.js";
import { explorer } from "./registry/explorer.js";
import { frontend } from "./registry/frontend.js";
import { git } from "./registry/git.js";
import { manager } from "./registry/manager.js";
import { mobile } from "./registry/mobile.js";
import { native } from "./registry/native.js";
import { quality } from "./registry/quality.js";
import { security } from "./registry/security.js";

/**
 * Sanitizes description or displayName strings before embedding them into frontmatter.
 * Replaces delimiters (like ---), strips newlines to avoid formatting breakage, and trims.
 */
export function sanitizeFrontmatterText(text: string): string {
    if (!text) return "";
    return text
        .replace(/---/g, "- - -") // Prevent frontmatter boundary injection
        .replace(/\r?\n/g, " ")   // Replace line breaks with spaces
        .trim();
}

// ────────────────────────────────────────────────────────────────────────────
//  1. Shared tool names — add new tools only here
// ────────────────────────────────────────────────────────────────────────────

export const TOOL_KEYS = [
    "read_file",
    "write_file",
    "replace_text",
    "batch_surgical_edit",
    "patch_file",
    "list_dir",
    "grep_search",
    "run_shell_command",
    "view_file",
    "run_tests",
    "log_agent_action",
    "send_agent_message",
    "orchestrate_loop",
    "get_project_map",
    "get_project_gaps",
    "check_compliance",
    "get_memory_insights",
    "read_project_memory",
    "update_project_memory",
    "audit_dependencies",
    "get_framework_status",
    "get_system_health",
    "ask_human",
    "check_active_ports",
    "update_contract_hash",
    "store_knowledge",
    "search_knowledge",
    "delete_knowledge",
    "acquire_lock",
    "release_lock",
    "register_agent",
    "check_lint",
] as const;

export type ToolKey = (typeof TOOL_KEYS)[number];

// ─────────────────────────────────────────────────────────────────────────────
//  Tool Maps — Internal tool names → platform-native tool identifiers
//  Shared keys are reused across platforms; only platform values differ.
// ─────────────────────────────────────────────────────────────────────────────

// Internal tool name → Claude Code tool name
const CLAUDE_TOOL_VALUES: Record<ToolKey, string> = {
    read_file:             "Read",
    write_file:            "Write",
    replace_text:          "Edit",
    batch_surgical_edit:   "MultiEdit",
    patch_file:            "Edit",
    list_dir:              "LS",
    grep_search:           "Grep",
    run_shell_command:     "Bash",
    view_file:             "Read",
    run_tests:             "Bash",
    log_agent_action:      "Write",
    send_agent_message:    "Task",
    orchestrate_loop:      "Task",
    get_project_map:       "Bash",
    get_project_gaps:      "Bash",
    check_compliance:      "Bash",
    get_memory_insights:   "Read",
    read_project_memory:   "Read",
    update_project_memory: "Write",
    audit_dependencies:    "Bash",
    get_framework_status:  "Bash",
    get_system_health:     "Bash",
    ask_human:             "Task",
    check_active_ports:    "Bash",
    update_contract_hash:  "Write",
    store_knowledge:       "Write",
    search_knowledge:      "Read",
    delete_knowledge:      "Write",
    acquire_lock:          "Write",
    release_lock:          "Write",
    register_agent:        "Write",
    check_lint:            "Bash",
};

// Internal tool name → Gemini CLI tool name
const GEMINI_TOOL_VALUES: Record<ToolKey, string> = {
    read_file:             "read_file",
    write_file:            "write_file",
    replace_text:          "replace",
    batch_surgical_edit:   "replace",
    patch_file:            "replace",
    list_dir:              "list_directory",
    grep_search:           "grep_search",
    run_shell_command:     "run_shell_command",
    view_file:             "read_file",
    run_tests:             "run_shell_command",
    log_agent_action:      "write_file",
    send_agent_message:    "run_shell_command",
    orchestrate_loop:      "run_shell_command",
    get_project_map:       "run_shell_command",
    get_project_gaps:      "run_shell_command",
    check_compliance:      "run_shell_command",
    get_memory_insights:   "read_file",
    read_project_memory:   "read_file",
    update_project_memory: "write_file",
    audit_dependencies:    "run_shell_command",
    get_framework_status:  "run_shell_command",
    get_system_health:     "run_shell_command",
    ask_human:             "run_shell_command",
    check_active_ports:    "run_shell_command",
    update_contract_hash:  "write_file",
    store_knowledge:       "write_file",
    search_knowledge:      "read_file",
    delete_knowledge:      "write_file",
    acquire_lock:          "write_file",
    release_lock:          "write_file",
    register_agent:        "write_file",
    check_lint:            "run_shell_command",
};

/** Generated from TOOL_KEYS + CLAUDE_TOOL_VALUES. */
export const CLAUDE_TOOL_MAP: Record<string, string> =
    Object.fromEntries(TOOL_KEYS.map(k => [k, CLAUDE_TOOL_VALUES[k]]));

/** Generated from TOOL_KEYS + GEMINI_TOOL_VALUES. */
export const GEMINI_TOOL_MAP: Record<string, string> =
    Object.fromEntries(TOOL_KEYS.map(k => [k, GEMINI_TOOL_VALUES[k]]));

// ─────────────────────────────────────────────────────────────────────────────
//  Agent List
// ─────────────────────────────────────────────────────────────────────────────

export const ALL_AGENTS: AgentDefinition[] = [
    manager,
    security,
    architect,
    backend,
    frontend,
    mobile,
    quality,
    database,
    devops,
    analyst,
    native,
    explorer,
    git,
];

// ─────────────────────────────────────────────────────────────────────────────
//  2. Shared Enterprise Context Builder — DRY principle
// ─────────────────────────────────────────────────────────────────────────────

/** Build enterprise context — use detailed=true for full agent prompts, false for compact JSON payloads */
function buildEnterpriseContext(
    paths?: Record<string, string>,
    backendLanguage?: string,
    detailed = false
): string[] {
    const p = paths ?? { backend: "apps/backend", frontend: "apps/web", mobile: "apps/mobile", docs: "docs" };
    const lang = backendLanguage ?? "Node.js (TypeScript)";

    const base = [
        `- You are a specialist in **${lang}** development for backend tasks.`,
        "- Always pass the active Trace ID in all messages.",
        "- Read PROJECT_MEMORY.md at session start.",
        "- Prefer surgical edits over full file rewrites.",
        "- Escalate high-risk operations to @manager.",
        `- Ensure development happens inside ${p.backend}, ${p.frontend}, or ${p.mobile}.`,
    ];

    if (detailed) {
        return [
            "You are operating within a **multi-agent enterprise system** governed by the Agent Atabey framework.",
            "All actions are traced, logged, and auditable. Every decision must be defensible and reversible.",
            ...base,
            "- Never perform irreversible operations (schema drops, bulk deletes) without @manager approval.",
            "- Escalate ambiguity to @manager instead of guessing.",
        ];
    }

    return [
        "You are part of a multi-agent enterprise governance system.",
        ...base,
    ];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared Helpers — DRY utilities used across multiple exporters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the meta footer HTML comment block appended to agent markdown files.
 * Extracted to eliminate duplication in toGeminiCliMd and toCodexMd.
 */
function buildMetaFooter(ag: AgentDefinition): string {
    return [
        "",
        `<!-- name: ${ag.name} -->`,
        `<!-- capability: ${ag.capability} -->`,
        `<!-- tags: ${JSON.stringify(ag.tags)} -->`,
    ].join("\n");
}

/**
 * Reads learned conventions from the agent's local memory specialty file.
 * Returns the content string, or empty string if the file does not exist.
 * Extracted to eliminate duplication in buildSystemPrompt and toAntigravityJson.
 */
function readLearnedConventions(agentName: string, frameworkDir: string): string {
    const specialtyFile = path.join(frameworkDir, "memory", "specialties", `${agentName}.md`);
    if (!fs.existsSync(specialtyFile)) return "";
    try {
        return fs.readFileSync(specialtyFile, "utf8").trim();
    } catch (err) {
        logger.debug(`Failed to read learned conventions for @${agentName}: ${(err as Error).message}`);
        return "";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Agent system prompt builder
// ─────────────────────────────────────────────────────────────────────────────


/**
 * Assigns the appropriate model based on capability score.
 * Only valid, real model identifiers are used here.
 */
function resolveModel(
    cap: number,
    platform: "claude-code" | "gemini-cli" | "antigravity" | "codex-cli"
): string {
    if (platform === "claude-code") {
        return cap === 10 ? "claude-opus-4-5"
            : cap === 9  ? "claude-sonnet-4-5"
                :              "claude-haiku-3-5";
    }
    if (platform === "gemini-cli" || platform === "antigravity") {
        return cap === 10 ? "gemini-2.5-pro"
            : cap === 9  ? "gemini-2.5-flash"
                :              "gemini-2.5-flash-lite";
    }
    return cap === 10 ? "o3" : "o4-mini";
}

// ─────────────────────────────────────────────────────────────────────────────
//  System Prompt Builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a rich, enterprise-grade system prompt from structured instructions.
 * Embeds governance document contents inline for agents that have knowledgeFiles.
 *
 * @param stripMetaComments - When true, skips the HTML meta-comment header block
 *   (name/capability/tags). Set to true for Gemini CLI and Grok, whose strict
 *   frontmatter validators may misinterpret HTML comments in the document body
 *   as unrecognized YAML keys and reject the agent file entirely.
 */
function buildSystemPrompt(
    ag: AgentDefinition,
    _baseKnowledgeDir: string = path.join(getPackageRoot(), "templates/standards"),
    stripMetaComments = false,
    paths: Record<string, string> = { backend: "apps/backend", frontend: "apps/web", mobile: "apps/mobile", docs: "docs" },
    backendLanguage: string = "Node.js (TypeScript)"
): string {
    const metaHeader = stripMetaComments ? [] : [
        `<!-- name: ${ag.name} -->`,
        `<!-- capability: ${ag.capability} -->`,
        `<!-- tags: ${JSON.stringify(ag.tags)} -->`,
        "",
    ];
    const lines: string[] = [
        ...metaHeader,
        `# [ATABEY] ${ag.displayName} — Agent Atabey`,
        "",
        "## Identity",
        ag.instructions.identity,
        "",
        "## Mission",
        ag.instructions.mission,
        "",
        "## Role Scope",
        `**Primary Role:** ${ag.role}`,
        `**Authority Tier:** ${ag.tier} (Capability: ${ag.capability}/10)`,
        "",
        "## Project Structure & Technology",
        "This project uses the following stack and directory structure:",
        `- **Backend Language:** ${backendLanguage}`,
        `- **Backend Path:** ${paths.backend}`,
        `- **Frontend Path:** ${paths.frontend}`,
        `- **Mobile Path:** ${paths.mobile}`,
        `- **Documentation:** ${paths.docs}`,
        "",
        "## Chain of Thought Protocol",
        "> Follow these steps in strict order for every task:",
        "",
        ag.instructions.chainOfThought,
        "",
        "## Discipline Rules",
        "> These are **non-negotiable** governance mandates. Violating any rule triggers an immediate task freeze.",
        "",
        ...ag.instructions.rules.map((r: string, i: number) => `${i + 1}. ${r}`),
        "",
        "## Enterprise Context",
        ...buildEnterpriseContext(paths, backendLanguage, true),
        "",
        "## Corporate Code Discipline Standards",
        "> These are **mandatory** code quality standards. Every commit must comply.",
        "",
        "### Clean Code Principles",
        "- **Meaningful Names:** Use descriptive, intention-revealing names for classes, functions, and variables.",
        "- **Single Responsibility:** Each function/class must have exactly one reason to change.",
        "- **Small Functions:** Keep functions under 20 lines. Extract helper functions liberally.",
        "- **No Magic Numbers:** Replace all magic numbers/strings with named constants.",
        "- **Early Return:** Use early returns to reduce nesting and improve readability.",
        "- **No Dead Code:** Remove unused imports, variables, functions, and comments.",
        "- **Consistent Formatting:** Follow project ESLint/Prettier config strictly.",
        "",
        "### SOLID Principles",
        "- **S**ingle Responsibility: One class = one responsibility.",
        "- **O**pen/Closed: Open for extension, closed for modification.",
        "- **L**iskov Substitution: Derived classes must be substitutable for base classes.",
        "- **I**nterface Segregation: Small, focused interfaces over large, general ones.",
        "- **D**ependency Inversion: Depend on abstractions, not concretions.",
        "",
        "### DRY, KISS, YAGNI",
        "- **DRY:** Never duplicate code. Extract shared logic into reusable modules.",
        "- **KISS:** Prefer simple solutions over complex ones. Simplicity is the ultimate sophistication.",
        "- **YAGNI:** Don't implement features you don't need right now. Avoid speculative generality.",
        "",
        "### Code Review Checklist",
        "- [ ] No `any` types — use proper TypeScript types/interfaces",
        "- [ ] No `console.log` — use the project's logger",
        "- [ ] No hardcoded secrets/credentials",
        "- [ ] All new functions have JSDoc comments",
        "- [ ] Error handling is proper (no empty catch blocks)",
        "- [ ] No TODO/FIXME without a linked issue",
        "- [ ] Tests exist for new functionality",
        "- [ ] No unused imports or variables",
        "- [ ] No raw SQL strings — use query builder",
        "- [ ] No direct DB calls in controllers — use repository pattern",
    ];

    if (ag.instructions.knowledgeFiles?.length) {
        lines.push("", "## Governance Standards (Dynamic RAG)");
        lines.push("> You have access to corporate standards via the 'search_knowledge' tool. You are required to follow these standards. Query them dynamically when relevant:");
        ag.instructions.knowledgeFiles.forEach((f: string) => {
            const standardTopic = f.replace("-standards.md", "").replace(".md", "");
            lines.push(`- **${f}** — Dynamic search query: "${standardTopic}"`);
        });
    }

    // Read learned conventions from local memory if exist (Memory V2)
    const fDir = getFrameworkDir();
    const learnedContent = readLearnedConventions(ag.name, fDir);
    if (learnedContent) {
        lines.push(
            "",
            "## Learned Conventions (Project-Specific Experience)",
            "> These are lessons learned from past task executions in this project. Adhere to them strictly.",
            "",
            learnedContent
        );
    }

    return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
//  CLAUDE CODE  →  .claude/agents/{name}.md
//  Valid fields: name, description, model, tools, color
//  Ref: https://docs.anthropic.com/en/docs/claude-code/sub-agents
// ─────────────────────────────────────────────────────────────────────────────

export function toClaudeCodeMd(ag: AgentDefinition, baseKnowledgeDir?: string, paths?: Record<string, string>, backendLanguage?: string): string {
    const tools = [...new Set(ag.tools.map((t: string) => CLAUDE_TOOL_MAP[t] ?? t))];
    const model = resolveModel(ag.capability, "claude-code");
    const color = ag.tier === "supreme" ? "purple"
        : ag.tier === "recon"   ? "gray"
            :                         "blue";

    const cleanDesc = sanitizeFrontmatterText(ag.description);
    const frontmatter = [
        "---",
        `name: ${ag.name}`,
        "description: >-",
        `  ${cleanDesc} Invoke proactively for ${ag.role.toLowerCase()} tasks in enterprise monorepo projects.`,
        `model: ${model}`,
        `tools: [${tools.map(t => `"${t}"`).join(", ")}]`,
        `color: ${color}`,
        "---",
    ].join("\n");

    return `${frontmatter}\n\n${buildSystemPrompt(ag, baseKnowledgeDir, false, paths, backendLanguage)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  GEMINI CLI  →  .gemini/agents/{name}.md
//  Valid fields: name, description, model, tools (YAML list)
//  Ref: https://ai.google.dev/gemini-api/docs/agents
// ─────────────────────────────────────────────────────────────────────────────

export function toGeminiCliMd(ag: AgentDefinition, baseKnowledgeDir?: string, paths?: Record<string, string>, backendLanguage?: string): string {
    const tools = [...new Set(ag.tools.map((t: string) => GEMINI_TOOL_MAP[t] ?? t))];
    const model = resolveModel(ag.capability, "gemini-cli");

    const cleanDesc = sanitizeFrontmatterText(ag.description);
    const frontmatter = [
        "---",
        `name: ${ag.name}`,
        "description: >-",
        `  ${cleanDesc} Use for ${ag.role.toLowerCase()} tasks.`,
        `model: ${model}`,
        "tools:",
        ...tools.map(t => `  - ${t}`),
        "---",
    ].join("\n");

    const body = buildSystemPrompt(ag, baseKnowledgeDir, true, paths, backendLanguage);
    return `${frontmatter}\n\n${body}${buildMetaFooter(ag)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANTIGRAVITY CLI  →  .agents/{name}/agent.json
//  Spec: Antigravity customAgentSpec JSON schema
// ─────────────────────────────────────────────────────────────────────────────

export function toAntigravityJson(ag: AgentDefinition, _baseKnowledgeDir?: string, paths?: Record<string, string>, backendLanguage: string = "Node.js (TypeScript)"): string {
    const knowledgeSections = (ag.instructions.knowledgeFiles ?? []).map((f: string) => {
        const standardTopic = f.replace("-standards.md", "").replace(".md", "");
        return {
            title: `Required Reading — ${f}`,
            content: `Comply with standard: ${f}. This standard is indexed in your Vector Memory. You MUST query it dynamically using the 'search_knowledge' tool (query: "${standardTopic}") when working on related tasks.`
        };
    });

    // Read learned conventions from local memory if exist (Memory V2)
    const fDir = getFrameworkDir();
    const learnedContent = readLearnedConventions(ag.name, fDir);
    const specialtySections: Array<{ title: string; content: string }> = [];
    if (learnedContent) {
        specialtySections.push({
            title: "Learned Conventions (Project-Specific Experience)",
            content: learnedContent,
        });
    }

    const payload = {
        name: ag.name,
        displayName: ag.displayName,
        description: ag.description,
        hidden: false,
        schemaVersion: "2.0",
        customAgentSpec: {
            customAgent: {
                systemPromptSections: [
                    {
                        title: "Identity & Mission",
                        content: `${ag.instructions.identity}\n\n**Mission:** ${ag.instructions.mission}`,
                    },
                    {
                        title: "Project Structure & Technology",
                        content: [
                            "This project uses the following stack and directory structure:",
                            `- Backend Language: ${backendLanguage}`,
                            `- Backend Path: ${paths?.backend || "apps/backend"}`,
                            `- Frontend Path: ${paths?.frontend || "apps/web"}`,
                            `- Mobile Path: ${paths?.mobile || "apps/mobile"}`,
                            `- Documentation: ${paths?.docs || "docs"}`,
                        ].join("\n"),
                    },
                    {
                        title: "Chain of Thought Protocol",
                        content: ag.instructions.chainOfThought,
                    },
                    {
                        title: "Discipline Rules",
                        content: ag.instructions.rules.map((r: string, i: number) => `${i + 1}. ${r}`).join("\n"),
                    },
                    {
                        title: "Enterprise Context",
                        content: buildEnterpriseContext(paths, backendLanguage, false).join("\n"),
                    },
                    ...knowledgeSections,
                    ...specialtySections,
                ],
                toolNames: ag.tools,
            },
        },
    };
    return JSON.stringify(payload, null, 2);
}

/** Alias for Antigravity JSON export used by CLI */
export const buildAgentJson = toAntigravityJson;

// ─────────────────────────────────────────────────────────────────────────────
//  4. CODEX CLI (OpenAI)  →  .agents/{name}.md
//  Codex tool categorization is now derived from TOOL_KEYS.
// ─────────────────────────────────────────────────────────────────────────────

const CODEX_READ_TOOLS = new Set([
    "read_file", "view_file", "list_dir", "grep_search",
    "get_memory_insights", "read_project_memory",
    "get_project_map", "get_project_gaps", "get_framework_status",
    "search_knowledge",
]);

const CODEX_WRITE_TOOLS = new Set([
    "write_file", "replace_text", "batch_surgical_edit", "patch_file",
    "update_project_memory", "log_agent_action",
    "acquire_lock", "release_lock", "register_agent",
    "update_contract_hash", "store_knowledge", "delete_knowledge",
]);

function codexToolCategory(tool: string): string {
    if (CODEX_READ_TOOLS.has(tool)) return "read";
    if (CODEX_WRITE_TOOLS.has(tool)) return "write";
    return "shell";
}

export function toCodexMd(ag: AgentDefinition, baseKnowledgeDir?: string, paths?: Record<string, string>, backendLanguage?: string): string {
    const model = resolveModel(ag.capability, "codex-cli");
    const tools = [...new Set(ag.tools.map(codexToolCategory))];

    const cleanDesc = sanitizeFrontmatterText(ag.description);
    const cleanDisplayName = sanitizeFrontmatterText(ag.displayName).replace(/"/g, "\\\"");
    const frontmatter = [
        "---",
        `agent-type: "${ag.name}"`,
        `display-name: "${cleanDisplayName}"`,
        "when-to-use: >-",
        `  Invoke for ${ag.role.toLowerCase()} tasks. ${cleanDesc}`,
        `model: ${model}`,
        `allowed-tools: [${tools.map(t => `"${t}"`).join(", ")}]`,
        "---",
    ].join("\n");

    const body = buildSystemPrompt(ag, baseKnowledgeDir, true, paths, backendLanguage);
    return `${frontmatter}\n\n${body}${buildMetaFooter(ag)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  CURSOR IDE  →  .cursor/rules/{name}.mdc
//  Valid fields: description, globs, alwaysApply
//  Ref: https://docs.cursor.com/context/rules
// ─────────────────────────────────────────────────────────────────────────────

export function toCursorMdc(ag: AgentDefinition, baseKnowledgeDir?: string, paths?: Record<string, string>, backendLanguage?: string): string {
    const glob = CURSOR_AGENT_GLOBS[ag.name] || "**/*";
    const cleanDesc = sanitizeFrontmatterText(`${ag.displayName} — ${ag.description}`);
    const safeDesc = cleanDesc.slice(0, 120).replace(/"/g, "\\\"");
    const frontmatter = [
        "---",
        `description: "${safeDesc}"`,
        `globs: "${glob}"`,
        "alwaysApply: false",
        "---",
    ].join("\n");

    return `${frontmatter}\n\n${buildSystemPrompt(ag, baseKnowledgeDir, false, paths, backendLanguage)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Batch export
// ─────────────────────────────────────────────────────────────────────────────

export type ExportTarget = "claude-code" | "gemini-cli" | "antigravity" | "codex-cli" | "cursor";

export interface ExportedFile {
  path: string;
  content: string;
}

export function exportAllAgents(target: ExportTarget, paths?: Record<string, string>, backendLanguage?: string): ExportedFile[] {
    return ALL_AGENTS.map(ag => {
        switch (target) {
            case "claude-code":
                return { path: `.claude/agents/${ag.name}.md`,         content: toClaudeCodeMd(ag, undefined, paths, backendLanguage) };
            case "gemini-cli":
                return { path: `.gemini/agents/${ag.name}.md`,         content: toGeminiCliMd(ag, undefined, paths, backendLanguage) };
            case "antigravity":
                return { path: `.agents/${ag.name}/agent.json`,        content: toAntigravityJson(ag, undefined, paths, backendLanguage) };
            case "codex-cli":
                return { path: `.agents/${ag.name}.md`,                content: toCodexMd(ag, undefined, paths, backendLanguage) };
            case "cursor":
                return { path: `.cursor/rules/${ag.name}.mdc`,         content: toCursorMdc(ag, undefined, paths, backendLanguage) };
        }
    });
}
