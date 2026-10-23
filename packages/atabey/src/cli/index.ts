#!/usr/bin/env node
import fs from "fs";
import { AtabeyBaseError } from "../shared/errors.js";
import { logger } from "../shared/logger.js";
import { approveCommand } from "./commands/approve.js";
import { checkCommand } from "./commands/check.js";
import { coverageCommand } from "./commands/coverage.js";
import { initCommand } from "./commands/init.js";
import { updateCommand } from "./commands/update.js";
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
    update: {
        run: async () => { await updateCommand(); },
        description: "Refresh the governance scaffold after a package upgrade (preserves memory, knowledge, RBAC)",
    },
    init: {
        run: async (args) => {
            // Adapter = first positional arg, skipping values consumed by flags
            // (e.g. `--focus backend` must not treat "backend" as the adapter).
            const VALUE_FLAGS = new Set([
                "--focus", "--type", "-t", "--lang", "-l",
                "--backend", "-b", "--frontend", "-f", "--native", "--mobile",
                "--backend-language", "--frontend-framework", "--native-language", "--mobile-framework",
            ]);
            let adapterArg: string | undefined;
            for (let i = 0; i < args.length; i++) {
                const a = args[i];
                if (a.startsWith("-")) {
                    if (!a.includes("=") && VALUE_FLAGS.has(a)) i++; // skip flag value
                    continue;
                }
                if (a === "init") continue;
                adapterArg = a;
                break;
            }
            const adapter = adapterArg || "claude";

            const typeIndex = args.findIndex(a => a === "--type" || a === "--focus" || a === "-t");
            const focus = (typeIndex !== -1 && args[typeIndex + 1]) ? args[typeIndex + 1] : undefined;

            const langIndex = args.findIndex(a => a === "--lang" || a === "-l");
            const language = (langIndex !== -1 && args[langIndex + 1]) ? args[langIndex + 1] as "tr" | "en" : undefined;

            const flagValue = (names: string[]): string | undefined => {
                for (const name of names) {
                    const eq = args.find(a => a.startsWith(`${name}=`));
                    if (eq) return eq.slice(name.length + 1);
                    const idx = args.findIndex(a => a === name);
                    if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith("-")) return args[idx + 1];
                }
                return undefined;
            };

            const backend = flagValue(["--backend", "--backend-language", "-b"]);
            const frontend = flagValue(["--frontend", "--frontend-framework", "-f"]);
            const native = flagValue(["--native", "--native-language"]);
            const mobile = flagValue(["--mobile", "--mobile-framework", "-m"]);

            await initCommand(adapter, {
                dryRun: args.includes("--dry-run"),
                yes: args.includes("--yes") || args.includes("-y"),
                focus,
                language,
                backend,
                frontend,
                native,
                mobile,
                global: args.includes("--global"),
                importDocs: args.includes("--import-docs"),
                skipIndex: args.includes("--skip-index"),
            });
        },
        description: "Initialize Atabey for one AI platform (claude|cursor|codex|grok|local|antigravity-cli|opencode) or all of them (all) [--focus fullstack|backend|frontend|mobile] [--backend node|go|java|python|dotnet|rust] [--frontend vite|next|vanilla] [--mobile react-native|flutter] [--native rust|go] [--import-docs] [--skip-index] [--global]",
    },
    mcp: {
        run: async (args) => { await mcpCommand(args); },
        description: "Manage MCP server (start|install|status)",
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
            } else if (args[0] === "list") {
                const { listPlansCommand } = await import("./commands/plan.js");
                await listPlansCommand();
            } else { await planCommand(); }
        },
        description: "Read/Submit task plans (plan submit <json> | plan list)",
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
    grill: {
        run: async (args) => {
            const topic = args.join(" ") || "Proposed Feature";
            const traceId = getActiveTraceId();
            UI.intent("Socratic Planning Griller (@analyst & @architect)", `Analyzing topic: "${topic}"`);
            UI.info("Referencing prompt recipe: .atabey/prompts/grill-recipe.md\n");
            await sendMessage({
                from: "@user",
                to: "@analyst",
                category: "ACTION",
                content: `[GRILL-ME] Please execute Socratic interrogation against Atabey standards for: ${topic}`,
                traceId
            });
            UI.success(`[OK] Interrogation triggered for @analyst (Trace: ${traceId}). Next step: atabey orchestrate`);
        },
        description: "Socratic assumption stress-testing and pre-mortem interrogation (atabey grill <topic>)",
    },
    spec: {
        run: async (args) => {
            const { specCommand } = await import("./commands/spec.js");
            await specCommand(args);
        },
        description: "Specification engine (init|parse|to-tickets)",
    },
    "to-tickets": {
        run: async (args) => {
            const { specCommand } = await import("./commands/spec.js");
            await specCommand(["to-tickets", ...args]);
        },
        description: "Decompose a SPEC into verifiable DAG tickets (alias for spec parse)",
    },
    handoff: {
        run: async (args) => {
            const { handoffCommand } = await import("./commands/handoff.js");
            await handoffCommand(args);
        },
        description: "Preserve and freeze active session state into .atabey/memory/session-handoff.md",
    },
    retro: {
        run: async (args) => {
            const { retroCommand } = await import("./commands/retro.js");
            await retroCommand(args);
        },
        description: "Post-task retrospective and learning sync into PROJECT_MEMORY.md",
    },
    git: {
        run: async (args) => {
            if (args[0] === "sync") {
                const { gitSyncCommand } = await import("./commands/git.js");
                await gitSyncCommand();
            } else if (args[0] === "pr") {
                const { gitPrCommand } = await import("./commands/git.js");
                await gitPrCommand(args.slice(1));
            } else if (args[0] === "ci-status") {
                const { gitCiStatusCommand } = await import("./commands/git.js");
                await gitCiStatusCommand(args.slice(1));
            } else {
                const traceId = getActiveTraceId();
                const { gitCommitCommand } = await import("./commands/git.js");
                await gitCommitCommand(traceId);
            }
        },
        description: "Git operations (commit|sync|pr|ci-status)",
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
        run: async (args) => {
            const sub = args[0] || "verify";
            const { verifyApiContractCommand, updateApiContractCommand } = await import("./commands/contract.js");
            if (sub === "update") {
                await updateApiContractCommand();
            } else {
                await verifyApiContractCommand();
            }
        },
        description: "Contract integrity (verify|update)",
    },
    api: {
        run: async (args) => {
            const { apiCommand } = await import("./commands/api.js");
            await apiCommand(args);
        },
        description: "API catalog (scan|list|drift|json)",
    },
    worktree: {
        run: async (args) => {
            const { worktreeCommand } = await import("./commands/worktree.js");
            await worktreeCommand(args);
        },
        description: "Isolated agent worktrees (create|list|remove)",
    },
    hitl: {
        run: async (args) => {
            const sub = args[0] || "status";
            const { hitlStatusCommand, hitlAnswerCommand, hitlApproveCommand, hitlRejectCommand } = await import("./commands/hitl.js");
            if (sub === "status") {
                await hitlStatusCommand();
            } else if (sub === "answer") {
                await hitlAnswerCommand(args.slice(1).join(" "));
            } else if (sub === "approve") {
                await hitlApproveCommand(args[1]);
            } else if (sub === "reject") {
                await hitlRejectCommand(args[1], args.slice(2).join(" "));
            } else {
                await hitlAnswerCommand(args.join(" "));
            }
        },
        description: "Human-in-the-loop responses & approvals (status|answer|approve|reject)",
    },
    knowledge: {
        run: async (args) => {
            const sub = args[0];
            if (sub === "update" || sub === "store" || sub === "add") {
                const { updateKnowledgeBaseCommand } = await import("./commands/knowledge.js");
                await updateKnowledgeBaseCommand(args[1], args.slice(2).join(" "));
            } else if (sub === "search") {
                const { searchKnowledgeBaseCommand } = await import("./commands/knowledge.js");
                await searchKnowledgeBaseCommand(args.slice(1).join(" "));
            } else {
                const { searchKnowledgeBaseCommand } = await import("./commands/knowledge.js");
                await searchKnowledgeBaseCommand(args.join(" "));
            }
        },
        description: "Manage knowledge base (search|update)",
    },
    log: {
        run: async (args) => {
            const { viewLogsCommand } = await import("./commands/log.js");
            let limit = 20;
            const limitIdx = args.findIndex(a => a === "--limit" || a === "-n");
            if (limitIdx !== -1 && args[limitIdx + 1]) {
                limit = parseInt(args[limitIdx + 1], 10) || 20;
            }
            const agentArg = args.find(a => !a.startsWith("-") && a !== `${limit}`);
            await viewLogsCommand({ agent: agentArg, limit });
        },
        description: "View agent execution logs (atabey log [@agent] [--limit 20])",
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
    db: {
        run: async (args) => {
            const { dbCommand } = await import("./commands/db.js");
            await dbCommand(args);
        },
        description: "Manage SQLite database migrations, integrity & backups (status|migrate|verify|backup|restore)",
    },
    secrets: {
        run: async (args) => {
            const { secretsCommand } = await import("./commands/secrets.js");
            await secretsCommand(args);
        },
        description: "Manage AES-256-GCM encrypted secrets vault & leak scanning (list|set|get|delete|scan)",
    },
    audit: {
        run: async (args) => {
            const { auditCommand } = await import("./commands/audit.js");
            await auditCommand(args);
        },
        description: "Audit trail (export [--format json|csv] [--out <file>] [--limit <n>] | erase <traceId> | erase --all --confirm KVKK-RIGHT-TO-ERASURE)",
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
    if (command === "help" || command === "-h" || command === "--help" || args.includes("--help") || args.includes("-h")) {
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
[ATABEY] v${getPackageVersion()} — Local Governance & Verification for AI Coding Agents

Usage:
  atabey <command> [options]
  atabey @<agent> "task"       (in AI chat)
  atabey "natural language"    (auto-routed to @manager)

Core Commands:
  update                                                 Refresh scaffold after package upgrade
                                                         (preserves memory, knowledge, RBAC)
  init [ai]                                              Initialize for one AI (claude default)
  init all                                               Initialize for ALL supported AIs
  init [ai] [--backend go --frontend next --native rust]  Choose stack (--yes)
  init [ai] [--import-docs]                              Import root .md docs into Atabey knowledge
  init [ai] [--skip-index]                               Skip the automatic RAG/symbol-graph indexing
  init [ai] [--global]                                   Also register MCP in user-level AI configs
  mcp start|install|status                               MCP server management
  orchestrate                                            Start orchestration loop
  check                                                  System health check
  status                                                 Agent status + costs
  plan [submit <json>]                                   Task planning
  grill <topic>                                          Socratic assumption stress-testing & pre-mortem
  spec init|parse <file>                                 Specification engine & contract design
  handoff [summary]                                      Preserve and freeze active session state
  retro [title]                                          Post-task retrospective & memory sync
  hitl [status|answer|approve|reject]                    HITL responses & approvals
  approve <traceId>                                      Approve blocked task
  trace new|replay <id>                                  Execution traces
  memory update <section> <content>                      Project memory
  git commit|sync                                        Git operations
  explorer graph|audit <path>                            Code analysis
  security <path>                                        Security audit
  compliance <path>                                      Compliance check
  contract verify|update                                   Contract integrity (update re-syncs hash)
  api <scan|list|drift|json> [--tag X] [--search X]      API endpoint catalog & drift check
  audit <export|erase> [args]                            Signed audit export / KVKK erasure
  worktree <create|list|remove> [name]                   Isolated agent worktrees
  knowledge [search|update] <query>                      Knowledge base operations
  db <status|migrate|verify|backup|restore> [path]       SQLite schema, integrity & backups
  secrets <list|set|get|delete|scan> [args]              AES-256-GCM secret vault & leak scan
  lint                                                   Run ESLint
  log [@agent] [--limit N]                               View agent logs
  script <name> [dir]                                    Run predefined script
  index [dir]                                            Index codebase for RAG
  coverage                                               Test coverage reports
  quickstart                                             Example project

Setup:
  One canonical setup — all 13 role profiles + governance (fail-closed when enforced).
  Choose the AI platform, not the team size: claude | cursor | codex | grok |
  local | antigravity-cli | opencode | all

MCP Integration (Primary Use):
  1. atabey init claude            (or: atabey init all)
  2. Open your AI assistant — MCP auto-starts the orchestrator
  3. Use @agent commands in AI chat

Examples:
  atabey init claude --yes
  atabey init all --yes
  atabey @backend "Create login API"
  atabey "Audit my project"
  atabey mcp start
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
