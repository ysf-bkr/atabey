import fs from "fs";
import path from "path";
import type { AdapterConfig, AdapterId } from "./types.js";
import { addMcpServerToClaude, findClaudeConfigPath } from "../../cli/utils/claude.js";
import { writeJsonFile } from "../../shared/fs.js";
import { registerGlobalAntigravityPlugins } from "./shared.js";
import { registry } from "./registry.js";
import { UI } from "../../cli/utils/ui.js";

// ─── Register Core Adapters ──────────────────────────────────────────────────

// [START] Claude
registry.register(
    {
        id: "claude",
        frameworkDir: ".claude",
        shimFile: "CLAUDE.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".claude/agents",
        agentsExt: ".md"
    },
    (projectRoot, mcpBlock, options) => {
        const configPath = findClaudeConfigPath();
        if (options?.global && configPath) {
            const block = mcpBlock as { mcpServers: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }> };
            const mcpEntry = block.mcpServers["atabey"] || {};
            const globalEntry = {
                ...mcpEntry,
                args: Array.isArray(mcpEntry.args)
                    ? mcpEntry.args.map((a) => (path.isAbsolute(a) ? a : path.resolve(projectRoot, a)))
                    : mcpEntry.args,
            };
            const ok = addMcpServerToClaude(configPath, "atabey", globalEntry);
            if (ok) UI.success(`Claude MCP registered → ${configPath}`);
        }
        const frameworkDir = ".claude";
        writeJsonFile(path.join(projectRoot, ".mcp.json"), mcpBlock);

        // PreToolUse Hook: Intercept built-in Edit/Write/Bash to enforce Atabey MCP governance
        const hooksDir = path.join(projectRoot, frameworkDir, "hooks");
        if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
        const hookScriptPath = path.join(hooksDir, "pre-tool-use.cjs");
        const hookContent = `#!/usr/bin/env node
/**
 * [ATABEY GOVERNANCE] Claude Code PreToolUse Enforcement Hook
 * Intercepts built-in tools (Edit, Write, Bash) and forces Atabey MCP tools.
 */
let inputData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { inputData += chunk; });
process.stdin.on("end", () => {
    let payload = null;
    try { if (inputData.trim()) payload = JSON.parse(inputData); } catch {}
    const toolName = (payload?.tool || payload?.tool_name || process.env.CLAUDE_TOOL_NAME || "").trim();
    if (toolName === "Edit" || toolName === "Write") {
        process.stderr.write(
            "\\n[ATABEY GOVERNANCE ERROR] Direct use of Claude Code built-in '" + toolName + "' tool is forbidden.\\n" +
            "All file modifications must pass through Atabey MCP tools:\\n" +
            "  • mcp__atabey__write_file (atomic file creation with RBAC & AST validation)\\n" +
            "  • mcp__atabey__replace_text (surgical single-block replacement)\\n" +
            "  • mcp__atabey__patch_file (line-range multi-line patching)\\n" +
            "  • mcp__atabey__batch_surgical_edit (atomic multi-file transaction)\\n\\n"
        );
        process.exit(1);
    }
    if (toolName === "Bash") {
        const cmd = String(payload?.input?.command || "").trim();
        const writePatterns = [/>\\s*[\\w./-]/, /\\b(rm|rmdir)\\b/, /\\b(mv|cp)\\b/, /\\b(sed\\s+-i|awk)\\b/, /\\b(chmod|chown)\\b/];
        if (writePatterns.some((p) => p.test(cmd))) {
            process.stderr.write(
                "\\n[ATABEY GOVERNANCE ERROR] Direct shell file modification via 'Bash' is blocked.\\n" +
                "Command: " + cmd.substring(0, 80) + "...\\n" +
                "Please use Atabey MCP file tools or 'mcp__atabey__run_command' which executes under sandbox gating.\\n\\n"
            );
            process.exit(1);
        }
    }
    process.exit(0);
});
`;
        fs.writeFileSync(hookScriptPath, hookContent, { mode: 0o755 });

        const settingsPath = path.join(projectRoot, frameworkDir, "settings.json");
        let existingSettings: Record<string, unknown> = {};
        if (fs.existsSync(settingsPath)) {
            try {
                existingSettings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            } catch {
                existingSettings = {};
            }
        }
        const perms = (existingSettings["permissions"] as Record<string, unknown>) || {};
        const allowList = Array.isArray(perms["allow"]) ? [...(perms["allow"] as string[])] : [];
        if (!allowList.includes("mcp__atabey__*")) allowList.push("mcp__atabey__*");
        perms["allow"] = allowList;
        perms["deny"] = ["Edit", "Write"];
        existingSettings["permissions"] = perms;
        existingSettings["hooks"] = {
            PreToolUse: [
                {
                    matcher: "Edit|Write|Bash",
                    command: "node .claude/hooks/pre-tool-use.cjs"
                }
            ]
        };
        existingSettings["enableAllProjectMcpServers"] = true;
        writeJsonFile(settingsPath, existingSettings);
        UI.success("Claude Code Governance Hook & MCP → .mcp.json & .claude/settings.json");
    }
);

// [AI] Grok
registry.register(
    {
        id: "grok",
        frameworkDir: ".grok",
        shimFile: "GROK.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".grok/agents",
        agentsExt: ".md"
    },
    (projectRoot, mcpBlock) => {
        const frameworkDir = ".grok";
        writeJsonFile(path.join(projectRoot, frameworkDir, "mcp_config.json"), mcpBlock);
        UI.success(`Grok MCP → ${frameworkDir}/mcp_config.json`);
    }
);

// [CURSOR] Cursor
registry.register(
    {
        id: "cursor",
        frameworkDir: ".cursor",
        shimFile: "CURSOR.md",
        nestedDirs: ["rules"],
        agentsDir: ".cursor/rules",
        agentsExt: ".mdc"
    },
    (projectRoot, mcpBlock) => {
        const frameworkDir = ".cursor";
        writeJsonFile(path.join(projectRoot, frameworkDir, "mcp.json"), mcpBlock);
        UI.success(`Cursor IDE Project MCP → ${frameworkDir}/mcp.json`);
    }
);

// [TIP] Codex (Copilot)
registry.register(
    {
        id: "codex",
        frameworkDir: ".agents",
        shimFile: "copilot-instructions.md",
        nestedDirs: ["skills", "rules", "instructions"],
        agentsDir: ".agents/instructions",
        agentsExt: ".md"
    },
    (projectRoot, mcpBlock) => {
        // Codex CLI / GitHub Copilot read the standard root `.mcp.json`.
        writeJsonFile(path.join(projectRoot, ".mcp.json"), mcpBlock);
        UI.success("Codex / Copilot Project MCP → .mcp.json");
    }
);

// [LOCAL] Local LLM (Ollama / Private AI)
registry.register(
    {
        id: "local",
        frameworkDir: ".atabey",
        shimFile: "LOCAL_AI.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".atabey/agents",
        agentsExt: ".md"
    },
    (projectRoot, mcpBlock) => {
        const frameworkDir = ".atabey";
        writeJsonFile(path.join(projectRoot, frameworkDir, "mcp_config.json"), mcpBlock);
        UI.success(`Local LLM MCP (Ollama/Private AI) registered → ${frameworkDir}/mcp_config.json`);
    }
);

// [ANTIGRAVITY] Antigravity
registry.register(
    {
        id: "antigravity-cli",
        frameworkDir: ".agents",
        shimFile: "AGENTS.md",
        nestedDirs: ["agents", "plugins", "rules"],
        agentsDir: ".agents/agents",
        agentsExt: ".md"
    },
    (projectRoot, mcpBlock, options) => {
        const frameworkDir = ".agents";
        writeJsonFile(path.join(projectRoot, frameworkDir, "mcp_config.json"), mcpBlock);
        UI.success(`Antigravity CLI MCP → ${frameworkDir}/mcp_config.json`);
        if (options?.global) {
            registerGlobalAntigravityPlugins(mcpBlock, projectRoot);
        }
    }
);

// [OPENCODE] OpenCode (opencode.ai)
registry.register(
    {
        id: "opencode",
        frameworkDir: ".opencode",
        shimFile: "OPENCODE.md",
        nestedDirs: ["agents", "rules"],
        agentsDir: ".opencode/agents",
        agentsExt: ".md"
    },
    (projectRoot, mcpBlock) => {
        // Standard OpenCode opencode.json in project root
        const opencodePath = path.join(projectRoot, "opencode.json");
        let existing: Record<string, unknown> = {};
        if (fs.existsSync(opencodePath)) {
            try {
                existing = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
            } catch {
                existing = {};
            }
        }

        const block = mcpBlock as { mcpServers: Record<string, { command?: string; args?: string[]; url?: string }> };
        const mcpEntry = block.mcpServers?.["atabey"];
        const localCommand = mcpEntry?.command
            ? [mcpEntry.command, ...(mcpEntry.args || [])]
            : ["npx", "-y", "atabey-mcp"];

        existing["$schema"] = "https://opencode.ai/config.json";
        const existingMcp = (existing["mcp"] as Record<string, unknown>) || {};
        
        // Single unified Atabey MCP entry (local stdio by default, or remote SSE if URL configured)
        if (mcpEntry?.url) {
            existingMcp["atabey"] = {
                type: "remote",
                url: mcpEntry.url,
                enabled: true
            };
        } else {
            existingMcp["atabey"] = {
                type: "local",
                command: localCommand,
                environment: {
                    ATABEY_PROJECT_ROOT: projectRoot,
                    MCP_TRANSPORT: "stdio",
                    ATABEY_AUTO_START_ORCHESTRATOR: "true"
                },
                enabled: true
            };
        }
        delete existingMcp["atabey-local"];
        existing["mcp"] = existingMcp;


        const instructions = Array.isArray(existing["instructions"]) ? existing["instructions"] : [];
        if (!instructions.includes("AGENTS.md")) instructions.push("AGENTS.md");
        if (!instructions.includes("OPENCODE.md")) instructions.push("OPENCODE.md");
        existing["instructions"] = instructions;

        writeJsonFile(opencodePath, existing);
        UI.success("OpenCode AI Config → opencode.json (100% compliant schema)");
    }
);

/**
 * Mapped Adapter Configurations
 */
export const ADAPTER_CONFIGS: Record<AdapterId, AdapterConfig> = registry.getConfigs();

/**
 * Post-Initialization Handlers for specific adapters
 */
export const POST_INIT_HANDLERS: Record<AdapterId, (projectRoot: string, mcpBlock: unknown, options?: { global?: boolean }) => void> = registry.getHandlers();
