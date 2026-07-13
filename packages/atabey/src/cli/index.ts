#!/usr/bin/env node
import fs from "fs";
import { FRAMEWORK } from "../shared/constants.js";
import { AtabeyBaseError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { approveCommand } from "./commands/approve.js";
import { checkCommand } from "./commands/check.js";
import { coverageCommand } from "./commands/coverage.js";
import { dashboardCommand } from "./commands/dashboard.js";
import { initCommand } from "./commands/init.js";
import { mcpCommand } from "./commands/mcp.js";
import { updateProjectMemoryCommand } from "./commands/memory.js";
import { orchestrateCommand, sendMessage } from "./commands/orchestrate.js";
import { planCommand, submitPlanCommand } from "./commands/plan.js";
import { quickstartCommand } from "./commands/quickstart.js";
import { statusCommand } from "./commands/status.js";
import { traceNewCommand, traceReplayCommand } from "./commands/trace.js";
import { getMemoryPath, readActiveTraceId } from "./utils/memory.js";
import { getPackageVersion } from "./utils/pkg.js";
import { UI } from "./utils/ui.js";

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Returns the active trace ID from project memory, or "T-000" if not set.
 * Extracted to eliminate repeated 4-line pattern across CLI commands.
 */
function getActiveTraceId(): string {
    const memPath = getMemoryPath();
    if (fs.existsSync(memPath)) {
        const tid = readActiveTraceId(fs.readFileSync(memPath, "utf8"));
        if (tid) return tid.trim();
    }
    return "T-000";
}

// ─── Main Commands ─────────────────────────────────────────────────────────

const COMMANDS: Record<string, { run: (args: string[]) => Promise<void>; description: string }> = {
    // Core
    init: {
        run: async (args) => {
            const profile = args.find((a): a is "freelancer" | "team" | "enterprise" => ["freelancer", "team", "enterprise"].includes(a));
            const adapter = args.find(a => !a.startsWith("-") && a !== "init" && !["freelancer", "team", "enterprise"].includes(a)) || "gemini";

            const typeIndex = args.findIndex(a => a === "--type" || a === "--focus" || a === "-t");
            const focus = (typeIndex !== -1 && args[typeIndex + 1]) ? args[typeIndex + 1] : undefined;

            const langIndex = args.findIndex(a => a === "--lang" || a === "-l");
            const language = (langIndex !== -1 && args[langIndex + 1]) ? args[langIndex + 1] as "tr" | "en" : undefined;

            await initCommand(adapter, {
                dryRun: args.includes("--dry-run"),
                unified: args.includes("--unified"),
                yes: args.includes("--yes") || args.includes("-y"),
                profile,
                focus,
                language,
            });
        },
        description: "Initialize Atabey (--profile freelancer|team|enterprise [--focus fullstack|backend|frontend|mobile] [--lang en])",
    },
    mcp: {
        run: async (args) => { await mcpCommand(args); },
        description: "Manage MCP server (start|install|status)",
    },
    dashboard: {
        run: async (args) => { await dashboardCommand(parseInt(args[0]) || FRAMEWORK.DASHBOARD_PORT); },
        description: "Open web dashboard (default: 5858)",
    },
    orchestrate: {
        run: async () => { await orchestrateCommand(); },
        description: "Start autonomous orchestration loop",
    },
    check: {
        run: async () => { await checkCommand(); },
        description: "System health check",
    },
    status: {
        run: async () => { await statusCommand(); },
        description: "Show agent statuses and costs",
    },
    plan: {
        run: async (args) => {
            if (args[0] === "submit") {
                try { await submitPlanCommand(JSON.parse(args.slice(1).join(" "))); }
                catch (e) { UI.error(`Invalid JSON: ${(e as Error).message}`); process.exit(64); }
            } else { await planCommand(); }
        },
        description: "Read/Submit task plans (plan:submit <json>)",
    },
    approve: {
        run: async (args) => {
            if (!args[0]) { UI.error("traceId required."); process.exit(64); }
            await approveCommand(args[0]);
        },
        description: "Approve blocked high-risk task",
    },
    trace: {
        run: async (args) => {
            if (args[0] === "new") {
                await traceNewCommand(args[1] || "Default task", args[2] || "manager", args[3] || "P1");
            } else if (args[0] === "replay") {
                if (!args[1]) { UI.error("traceId required."); process.exit(64); }
                await traceReplayCommand(args[1]);
            } else {
                UI.error("Usage: atabey trace new|replay <id>");
            }
        },
        description: "Manage traces (new|replay)",
    },
    memory: {
        run: async (args) => {
            if (args[0] === "update") {
                if (!args[1] || !args[2]) { UI.error("Usage: atabey memory update <section> <content>"); process.exit(64); }
                await updateProjectMemoryCommand(args[1], args[2]);
            } else {
                UI.error("Usage: atabey memory update <section> <content>");
            }
        },
        description: "Manage project memory (update)",
    },
    git: {
        run: async (args) => {
            if (args[0] === "sync") {
                const { gitSyncCommand } = await import("./commands/git.js");
                await gitSyncCommand();
            } else {
                const traceId = getActiveTraceId();
                const { gitCommitCommand } = await import("./commands/git.js");
                await gitCommitCommand(traceId);
            }
        },
        description: "Git operations (commit|sync)",
    },
    explorer: {
        run: async (args) => {
            const target = args[1] || "src";
            if (args[0] === "graph") {
                const { explorerGraphCommand } = await import("./commands/explorer.js");
                await explorerGraphCommand(target);
            } else if (args[0] === "audit") {
                const { explorerAuditCommand } = await import("./commands/explorer.js");
                await explorerAuditCommand(target);
            } else {
                await (await import("./commands/explorer.js")).explorerGraphCommand(target);
            }
        },
        description: "Code analysis (graph|audit)",
    },

    // Utility
    quickstart: { run: async () => { await quickstartCommand(); }, description: "Generate example task file" },
    coverage: { run: async () => { await coverageCommand(); }, description: "Test coverage reports" },
    compliance: {
        run: async (args) => {
            const { complianceCheckCommand } = await import("./commands/compliance.js");
            await complianceCheckCommand(args[0] || "src");
        },
        description: "Run compliance check against ATABEY.md constitution",
    },
    contract: {
        run: async (_args) => {
            const { verifyApiContractCommand } = await import("./commands/contract.js");
            await verifyApiContractCommand();
        },
        description: "Verify contract integrity",
    },
    knowledge: {
        run: async (args) => {
            const { searchKnowledgeBaseCommand } = await import("./commands/knowledge.js");
            await searchKnowledgeBaseCommand(args.join(" "));
        },
        description: "Manage knowledge base (search|store|delete)",
    },
    log: {
        run: async (args) => {
            const { logAgentActionCommand } = await import("./commands/log.js");
            await logAgentActionCommand({ agent: args[0], action: "VIEW_LOG", status: "SUCCESS", summary: args.slice(1).join(" ") || "Agent log view" });
        },
        description: "View agent execution logs",
    },
    script: {
        run: async (args) => {
            const { runScriptCommand } = await import("./commands/script.js");
            await runScriptCommand(args[0], args[1] || ".");
        },
        description: "Run a predefined script from .atabey/scripts/",
    },
    security: {
        run: async (args) => {
            const { securityAuditCommand } = await import("./commands/security.js");
            await securityAuditCommand(args[0] || "src");
        },
        description: "Security audit",
    },
    lint: {
        run: async () => {
            const { lintCommand } = await import("./commands/lint.js");
            await lintCommand();
        },
        description: "Run ESLint for the project",
    },
    index: {
        run: async (args) => {
            const { indexCodebaseCommand } = await import("./commands/index-codebase.js");
            await indexCodebaseCommand(args[0] || process.cwd());
        },
        description: "Index codebase & rules into vector memory for dynamic RAG",
    },
};

// ─── Aliases (shortcuts for power users) ───────────────────────────────────

const ALIASES: Record<string, string> = {
    "loop": "orchestrate",
};

async function main() {
    const args = process.argv.slice(2);
    let command = args[0] || "help";

    // Resolve aliases
    if (ALIASES[command]) command = ALIASES[command];

    // @agent delegation
    if (command.startsWith("@")) {
        const content = args.slice(1).join(" ");
        if (!content) { UI.error(`Missing task for ${command}.`); process.exit(64); }

        const traceId = getActiveTraceId();
        await sendMessage({ from: "@user", to: "@manager", category: "ACTION", content: `[${command}] ${content}`, traceId });
        process.stdout.write(`[OK] Sent to @manager for ${command} (Trace: ${traceId})\n`);
        return;
    }

    // Built-in flags
    if (command === "version" || command === "-v" || command === "--version") {
        process.stdout.write(`v${getPackageVersion()}\n`);
        return;
    }
    if (command === "help" || command === "-h" || command === "--help") {
        showHelp();
        return;
    }

    // Run command or fallback to @manager
    const cmd = COMMANDS[command];
    if (cmd) {
        await cmd.run(args.slice(1));
    } else if (command && !["help", "version"].includes(command)) {
        // Natural language → @manager
        const traceId = getActiveTraceId();
        await sendMessage({ from: "@user", to: "@manager", category: "ACTION", content: args.join(" "), traceId });
        process.stdout.write(`[OK] Sent to @manager (Trace: ${traceId})\n`);
    } else {
        showHelp();
    }
}

function showHelp() {
    process.stdout.write(`
[ATABEY] v${getPackageVersion()} — AI Governance & Multi-Agent Platform / Orchestrator

Usage:
  atabey <command> [options]
  atabey @<agent> "task"       (in AI chat)
  atabey "natural language"    (auto-routed to @manager)

Core Commands:
  init [adapter] [--profile freelancer|team|enterprise]  Initialize project
  mcp start|install|status                               MCP server management
  dashboard [port]                                       Web dashboard
  orchestrate                                            Start orchestration loop
  check                                                  System health check
  status                                                 Agent status + costs
  plan [submit <json>]                                   Task planning
  approve <traceId>                                      Approve blocked task
  trace new|replay <id>                                  Execution traces
  memory update <section> <content>                      Project memory
  git commit|sync                                        Git operations
  explorer graph|audit <path>                            Code analysis
  security <path>                                        Security audit
  compliance <path>                                      Compliance check
  contract                                               Verify contract integrity
  knowledge <query>                                      Knowledge base search
  lint                                                   Run ESLint
  log <agent> <message>                                  View agent logs
  script <name> [dir]                                    Run predefined script
  index [dir]                                            Index codebase for RAG
  coverage                                               Test coverage reports
  quickstart                                             Example project

Profiles:
  freelancer    Solo dev (3 agents: manager, backend, quality)
  team          5-15 people (7 core agents + dashboard)
  enterprise    15+ people (all 13 agents + full governance)

MCP Integration (Primary Use):
  1. atabey init gemini --profile freelancer
  2. Configure mcp.json for your AI (Claude/Gemini/Cursor)
  3. Use @agent commands in AI chat

Examples:
  atabey init gemini --profile freelancer --yes
  atabey @backend "Create login API"
  atabey "Audit my project"
  atabey dashboard
\n`);
}

main().catch((err) => {
    if (err instanceof AtabeyBaseError) {
        UI.error(`[${err.code}] ${err.message}`);
        if (err.solution) UI.info(`Solution: ${err.solution}`);
    } else {
        UI.error(`Fatal: ${err.message || String(err)}`);
    }
    logger.fatal("Fatal exception", err);
    process.exit(1);
});
