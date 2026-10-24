import fs from "fs";
import path from "path";
import type { AdapterConfig, AdapterId } from "./types.js";
import { addMcpServerToClaude, findClaudeConfigPath } from "../../cli/utils/claude.js";
import { writeJsonFile, writeTextFile } from "../../shared/fs.js";
import { upsertTomlTable } from "../../cli/utils/toml.js";
import { registerGlobalAntigravityPlugins } from "./shared.js";
import { registry } from "./registry.js";
import { UI } from "../../cli/utils/ui.js";

type McpBlock = { mcpServers: Record<string, McpEntry> };
type McpEntry = { command?: string; args?: string[]; env?: Record<string, string>; url?: string };

function entryOf(mcpBlock: unknown): McpEntry {
    const block = mcpBlock as McpBlock | undefined;
    return block?.mcpServers?.atabey ?? { command: "npx", args: ["-y", "atabey-mcp"] };
}

/** Reads a JSON config file, returning {} for missing or corrupt files. */
function readJsonConfig(filePath: string): Record<string, unknown> {
    if (!fs.existsSync(filePath)) return {};
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    } catch {
        UI.warning(`  Existing ${path.basename(filePath)} is not valid JSON — rewriting it.`);
        return {};
    }
}

// ─── Claude Code hook ────────────────────────────────────────────────────────
//
// Contract (code.claude.com/docs/en/hooks):
//   • settings shape is event → matcher group → nested `hooks` handler array
//   • a command handler needs `type: "command"`
//   • input arrives on stdin with `tool_name` and `tool_input`
//   • blocking is a JSON `hookSpecificOutput.permissionDecision: "deny"` on exit 0
//     (exit code 1 is a *non-blocking* error and does NOT stop the tool call)
//   • MCP tools are named `mcp__<server>__<tool>`, so Atabey's own tools must be
//     excluded or the governance layer would block itself.

const CLAUDE_HOOK_FILENAME = "pre-tool-use.cjs";

function claudeHookScript(): string {
    return `#!/usr/bin/env node
/**
 * [ATABEY] Claude Code PreToolUse hook.
 *
 * Denies built-in file mutation and shell writes so that work flows through the
 * Atabey MCP tools, which enforce RBAC, risk gating and audit. Atabey's own MCP
 * tools are always allowed.
 *
 * Denial is reported with the documented JSON decision, not an exit code:
 * exit 1 is a non-blocking error in Claude Code and would let the call through.
 */
const ATABEY_TOOL_PREFIX = "mcp__atabey__";

/** Built-in tools replaced by Atabey equivalents. */
const DENIED_TOOLS = new Set(["Edit", "Write", "NotebookEdit", "MultiEdit"]);

/** Shell writes that bypass the file-tool governance path. */
const SHELL_WRITE_PATTERNS = [
    />\\s*[\\w./~-]/,
    /\\b(rm|rmdir|unlink)\\b/,
    /\\b(mv|cp)\\b/,
    /\\b(sed\\s+-i|perl\\s+-pi)\\b/,
    /\\b(chmod|chown|chgrp)\\b/,
    /\\b(tee|truncate|dd)\\b/,
    /\\b(Remove-Item|Move-Item|Copy-Item|Set-Content|Out-File|New-Item)\\b/i,
    /\\bgit\\s+(reset\\s+--hard|clean\\s+-[a-z]*f|checkout\\s+--\\s)/,
];

function deny(reason) {
    process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: reason,
        },
    }));
    process.exit(0);
}

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
    let payload = {};
    try {
        if (raw.trim()) payload = JSON.parse(raw);
    } catch {
        process.exit(0); // malformed input: stay out of the way
    }

    const toolName = String(payload.tool_name || payload.tool || "").trim();
    if (!toolName) process.exit(0);

    // Never block Atabey's own MCP tools.
    if (toolName.startsWith(ATABEY_TOOL_PREFIX)) process.exit(0);

    if (DENIED_TOOLS.has(toolName)) {
        deny(
            "Direct use of Claude Code's built-in '" + toolName + "' tool is disabled by Atabey. " +
            "Use the Atabey MCP file tools instead (write_file, replace_text, patch_file, batch_surgical_edit).",
        );
    }

    if (toolName === "Bash" || toolName === "PowerShell") {
        const input = payload.tool_input || payload.input || {};
        const command = String(input.command || "").trim();
        if (command && SHELL_WRITE_PATTERNS.some((pattern) => pattern.test(command))) {
            deny(
                "Direct shell file modification is blocked by Atabey: " + command.slice(0, 80) + ". " +
                "Use the Atabey MCP file tools, or mcp__atabey__run_shell_command which runs under Atabey's sandbox and audit.",
            );
        }
    }

    process.exit(0);
});
`;
}

function writeClaudeHook(projectRoot: string): string {
    const hooksDir = path.join(projectRoot, ".claude", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    writeTextFile(path.join(hooksDir, CLAUDE_HOOK_FILENAME), claudeHookScript());
    try {
        fs.chmodSync(path.join(hooksDir, CLAUDE_HOOK_FILENAME), 0o755);
    } catch {
        /* best-effort on platforms without POSIX modes */
    }
    return `.claude/hooks/${CLAUDE_HOOK_FILENAME}`;
}

/**
 * Merges Atabey's PreToolUse group into an existing Claude settings object
 * without dropping user hooks, permissions or unrelated keys.
 */
function mergeClaudeSettings(existing: Record<string, unknown>, hookCommand: string): Record<string, unknown> {
    const settings = { ...existing };

    // permissions: union rather than replace.
    const perms = { ...(settings.permissions as Record<string, unknown> | undefined) };
    const deny = new Set<string>(Array.isArray(perms.deny) ? (perms.deny as string[]) : []);
    for (const tool of ["Edit", "Write", "NotebookEdit", "MultiEdit"]) deny.add(tool);
    const allow = new Set<string>(Array.isArray(perms.allow) ? (perms.allow as string[]) : []);
    allow.add("mcp__atabey__*");
    settings.permissions = { ...perms, allow: [...allow], deny: [...deny] };

    // hooks: append our matcher group, keep every existing group.
    const hooks = { ...(settings.hooks as Record<string, unknown> | undefined) };
    const preToolUse = Array.isArray(hooks.PreToolUse) ? [...(hooks.PreToolUse as unknown[])] : [];
    const isAtabeyGroup = (group: unknown): boolean => {
        const g = group as { hooks?: Array<{ command?: string }> };
        return Array.isArray(g?.hooks) && g.hooks.some((h) => typeof h?.command === "string" && h.command.includes(CLAUDE_HOOK_FILENAME));
    };
    const withoutAtabey = preToolUse.filter((group) => !isAtabeyGroup(group));
    withoutAtabey.push({
        matcher: "Edit|Write|NotebookEdit|MultiEdit|Bash|PowerShell",
        hooks: [{ type: "command", command: hookCommand }],
    });
    hooks.PreToolUse = withoutAtabey;
    settings.hooks = hooks;

    if (settings.enableAllProjectMcpServers === undefined) settings.enableAllProjectMcpServers = true;
    return settings;
}

// ─── Adapters ───────────────────────────────────────────────────────────────

// [CLAUDE] Claude Code — verified against code.claude.com/docs/en/hooks + /mcp
registry.register(
    {
        id: "claude",
        frameworkDir: ".claude",
        shimFile: "CLAUDE.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".claude/agents",
        agentsExt: ".md",
        support: "verified",
        supportNote: "project .mcp.json + settings.json PreToolUse hook; verified against Claude Code docs",
    },
    (projectRoot, mcpBlock, options) => {
        const configPath = findClaudeConfigPath();
        if (options?.global && configPath) {
            const mcpEntry = entryOf(mcpBlock);
            const globalEntry = {
                ...mcpEntry,
                args: Array.isArray(mcpEntry.args)
                    ? mcpEntry.args.map((a) => (path.isAbsolute(a) ? a : path.resolve(projectRoot, a)))
                    : mcpEntry.args,
            };
            const ok = addMcpServerToClaude(configPath, "atabey", globalEntry);
            if (ok) UI.success(`Claude MCP registered → ${configPath}`);
        }

        // Merge into .mcp.json instead of replacing it: this file is shared with
        // every other MCP server the user configured, and Claude Code reads the
        // whole object. Overwriting it silently deleted their servers.
        const rootMcpPath = path.join(projectRoot, ".mcp.json");
        const existingRoot = readJsonConfig(rootMcpPath);
        const existingServers = { ...(existingRoot.mcpServers as Record<string, unknown> | undefined) };
        existingServers.atabey = entryOf(mcpBlock);
        writeJsonFile(rootMcpPath, { ...existingRoot, mcpServers: existingServers });

        const hookRelPath = writeClaudeHook(projectRoot);

        const settingsPath = path.join(projectRoot, ".claude", "settings.json");
        const merged = mergeClaudeSettings(readJsonConfig(settingsPath), `node "${hookRelPath}"`);
        writeJsonFile(settingsPath, merged);
        UI.success("Claude Code Governance Hook & MCP → .mcp.json & .claude/settings.json");
    }
);

// [CURSOR] Cursor — verified against cursor.com/docs/context/mcp
registry.register(
    {
        id: "cursor",
        frameworkDir: ".cursor",
        shimFile: "CURSOR.md",
        nestedDirs: ["rules"],
        agentsDir: ".cursor/rules",
        agentsExt: ".mdc",
        support: "verified",
        supportNote: "project .cursor/mcp.json (mcpServers); verified against Cursor docs",
    },
    (projectRoot, mcpBlock) => {
        const configPath = path.join(projectRoot, ".cursor", "mcp.json");
        const existing = readJsonConfig(configPath);
        const servers = { ...(existing.mcpServers as Record<string, unknown> | undefined) };
        servers.atabey = entryOf(mcpBlock);
        writeJsonFile(configPath, { ...existing, mcpServers: servers });
        UI.success("Cursor IDE Project MCP → .cursor/mcp.json");
    }
);

// [CODEX] OpenAI Codex CLI — verified against developers.openai.com/codex/mcp
// Codex reads TOML `[mcp_servers.<name>]` tables, never JSON `.mcp.json`.
registry.register(
    {
        id: "codex",
        frameworkDir: ".agents",
        shimFile: "AGENTS.md",
        nestedDirs: ["skills", "rules", "instructions"],
        agentsDir: ".agents/instructions",
        agentsExt: ".md",
        support: "verified",
        supportNote: "project .codex/config.toml [mcp_servers.atabey]; verified against Codex docs (trusted projects only)",
    },
    (projectRoot, mcpBlock) => {
        const configDir = path.join(projectRoot, ".codex");
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, "config.toml");

        const entry = entryOf(mcpBlock);
        const command = entry.command || "npx";
        const args = entry.args || ["-y", "atabey-mcp"];

        const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
        const updated = upsertTomlTable(existing, "mcp_servers.atabey", {
            command,
            args,
            ...(entry.env && Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
        });
        writeTextFile(configPath, updated);
        UI.success("Codex CLI MCP → .codex/config.toml [mcp_servers.atabey]");
    }
);

// [COPILOT] GitHub Copilot in VS Code — verified against
// code.visualstudio.com/docs/agent-customization/mcp-servers
// VS Code's own format uses a top-level `servers` object in .vscode/mcp.json;
// the portable `.mcp.json` uses `mcpServers` and only works in workspace-root
// mode when `chat.mcp.workspaceRootConfig.enabled` is turned on.
registry.register(
    {
        id: "copilot",
        frameworkDir: ".github",
        shimFile: path.join(".github", "copilot-instructions.md"),
        nestedDirs: ["instructions"],
        agentsDir: ".github/instructions",
        agentsExt: ".md",
        support: "verified",
        supportNote: "project .vscode/mcp.json (servers); verified against VS Code docs",
    },
    (projectRoot, mcpBlock) => {
        const configPath = path.join(projectRoot, ".vscode", "mcp.json");
        const existing = readJsonConfig(configPath);
        const servers = { ...(existing.servers as Record<string, unknown> | undefined) };
        const entry = entryOf(mcpBlock);
        servers.atabey = {
            type: "stdio",
            command: entry.command || "npx",
            args: entry.args || ["-y", "atabey-mcp"],
            ...(entry.env && Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
        };
        writeJsonFile(configPath, { ...existing, servers });
        UI.success("GitHub Copilot (VS Code) MCP → .vscode/mcp.json");
    }
);

// [GROK] xAI Grok CLI — no published MCP config contract to verify against.
registry.register(
    {
        id: "grok",
        frameworkDir: ".grok",
        shimFile: "GROK.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".grok/agents",
        agentsExt: ".md",
        support: "experimental",
        supportNote: "writes .grok/mcp_config.json; not verified against vendor docs",
    },
    (projectRoot, mcpBlock) => {
        writeJsonFile(path.join(projectRoot, ".grok", "mcp_config.json"), mcpBlock);
        UI.warning("Grok MCP → .grok/mcp_config.json (EXPERIMENTAL — verify in your Grok build)");
    }
);

// [LOCAL] Local models (Ollama/vLLM/LM Studio) — a model server is not an MCP host.
registry.register(
    {
        id: "local",
        frameworkDir: ".atabey",
        shimFile: "LOCAL_AI.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".atabey/agents",
        agentsExt: ".md",
        support: "experimental",
        supportNote: "no MCP host: Ollama/vLLM/LM Studio serve models, they do not read this file",
    },
    (projectRoot, mcpBlock) => {
        writeJsonFile(path.join(projectRoot, ".atabey", "mcp_config.json"), mcpBlock);
        UI.warning("Local LLM MCP → .atabey/mcp_config.json (EXPERIMENTAL — needs an MCP host; a model server is not one)");
    }
);

// [ANTIGRAVITY] Antigravity CLI — no published MCP config contract to verify against.
registry.register(
    {
        id: "antigravity-cli",
        frameworkDir: ".agents",
        shimFile: "AGENTS.md",
        nestedDirs: ["agents", "plugins", "rules"],
        agentsDir: ".agents/agents",
        agentsExt: ".md",
        support: "experimental",
        supportNote: "writes .agents/mcp_config.json; not verified against vendor docs",
    },
    (projectRoot, mcpBlock, options) => {
        writeJsonFile(path.join(projectRoot, ".agents", "mcp_config.json"), mcpBlock);
        UI.warning("Antigravity CLI MCP → .agents/mcp_config.json (EXPERIMENTAL — verify in your CLI build)");
        if (options?.global) {
            registerGlobalAntigravityPlugins(mcpBlock, projectRoot);
        }
    }
);

// [OPENCODE] OpenCode — verified against opencode.ai/config.json schema usage.
registry.register(
    {
        id: "opencode",
        frameworkDir: ".opencode",
        shimFile: "OPENCODE.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".opencode/agents",
        agentsExt: ".md",
        support: "verified",
        supportNote: "project opencode.json (mcp.<name>); verified against OpenCode config schema",
    },
    (projectRoot, mcpBlock) => {
        const opencodePath = path.join(projectRoot, "opencode.json");
        const existing = readJsonConfig(opencodePath);

        existing["$schema"] = "https://opencode.ai/config.json";
        const existingMcp = { ...(existing["mcp"] as Record<string, unknown> | undefined) };
        const entry = entryOf(mcpBlock);

        if (entry.url) {
            existingMcp["atabey"] = { type: "remote", url: entry.url, enabled: true };
        } else {
            existingMcp["atabey"] = {
                type: "local",
                command: [entry.command || "npx", ...(entry.args || ["-y", "atabey-mcp"])],
                environment: entry.env || {},
                enabled: true,
            };
        }
        delete existingMcp["atabey-local"];
        existing["mcp"] = existingMcp;

        const instructions = Array.isArray(existing["instructions"]) ? (existing["instructions"] as string[]) : [];
        for (const file of ["AGENTS.md", "OPENCODE.md"]) {
            if (!instructions.includes(file)) instructions.push(file);
        }
        existing["instructions"] = instructions;

        writeJsonFile(opencodePath, existing);
        UI.success("OpenCode AI Config → opencode.json");
    }
);

/**
 * Mapped Adapter Configurations
 */
export const ADAPTER_CONFIGS: Record<AdapterId, AdapterConfig> = registry.getConfigs() as Record<AdapterId, AdapterConfig>;

/**
 * Post-Initialization Handlers for specific adapters
 */
export const POST_INIT_HANDLERS: Record<AdapterId, (projectRoot: string, mcpBlock: unknown, options?: { global?: boolean }) => void> = registry.getHandlers() as Record<AdapterId, (projectRoot: string, mcpBlock: unknown, options?: { global?: boolean }) => void>;
