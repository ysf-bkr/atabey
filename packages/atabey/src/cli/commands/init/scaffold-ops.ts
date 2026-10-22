import fs from "fs";
import path from "path";
import { logger } from "../../../shared/logger.js";
import { writeJsonFile, writeTextFile } from "../../utils/fs.js";
import { getPackageRoot } from "../../utils/pkg.js";
import { ALL_AGENTS } from "../../../modules/agents/definitions.js";

/** Real agent registry derived from the single source of truth. */
function buildAgentRegistry(): string {
    const rows = ALL_AGENTS.map(
        (a) => `| @${a.name} | ${a.displayName} | ${a.tier} | ${a.capability}/10 | ${a.role} |`
    ).join("\n");
    return [
        "# [ATABEY] Atabey — AL Registry",
        "",
        "> Auto-generated list of active specialized agents. Single source of truth: `modules/agents/definitions.ts`.",
        "",
        "| Agent | Display Name | Tier | Capability | Role |",
        "| --- | --- | --- | --- | --- |",
        rows,
        "",
    ].join("\n");
}

/** Real routing protocol derived from the RoutingEngine behaviour. */
function buildRoutingRules(): string {
    return [
        "# [SIGNAL] Atabey — Natural Language & Event Router",
        "",
        "> The RoutingEngine selects the most suitable specialist for a task using weighted TF-IDF over agent",
        "> specialties, role/name matches, and a capability bonus.",
        "",
        "## Routing Signals (in priority order)",
        "1. **Specialty match** — task tokens matched against each agent's `specialties` weights (TF-IDF weighted).",
        "2. **Role match** — token overlap with the agent's `role` (+3).",
        "3. **Display name match** — token overlap with the agent's `displayName` (+2).",
        "4. **Capability bonus** — `(capability - 5) * 0.5`.",
        "",
        "## Confidence",
        "- score > 15 → **high**",
        "- score > 7 → **medium**",
        "- otherwise → **low** (falls back to capability-based routing)",
        "",
        "## Agent Lifecycle",
        "Every routed task follows the deterministic lifecycle defined in `src/schema/agent-lifecycle.ts`",
        "(INIT → READY → PLANNING → EXECUTING → VERIFYING → MERGING → COMPLETED / FAILED).",
        "VERIFYING requires green tests before completion; MERGING requires an isolated branch/worktree",
        "with a signed EvidenceBundle before the task is marked COMPLETED.",
        "",
    ].join("\n");
}

export function scaffoldOps(frameworkDir: string, dryRun: boolean) {
    if (dryRun) return;

    // Scaffold Prompt Recipes
    const promptsPath = path.join(frameworkDir, "prompts");
    if (!fs.existsSync(promptsPath)) fs.mkdirSync(promptsPath, { recursive: true });

    const recipes = [
        { file: "refactoring-recipe.md", template: "templates/prompts/refactoring-recipe.md" },
        { file: "bug-fix-recipe.md", template: "templates/prompts/bug-fix-recipe.md" },
        { file: "new-feature-recipe.md", template: "templates/prompts/new-feature-recipe.md" },
        { file: "security-audit-recipe.md", template: "templates/prompts/security-audit-recipe.md" },
        { file: "db-management-recipe.md", template: "templates/prompts/db-management-recipe.md" },
        { file: "performance-optimization-recipe.md", template: "templates/prompts/performance-optimization-recipe.md" },
        { file: "deployment-recipe.md", template: "templates/prompts/deployment-recipe.md" },
        { file: "contract-design-recipe.md", template: "templates/prompts/contract-design-recipe.md" },
        { file: "grill-recipe.md", template: "templates/prompts/grill-recipe.md" },
        { file: "spec-generation-recipe.md", template: "templates/prompts/spec-generation-recipe.md" },
        { file: "code-review-recipe.md", template: "templates/prompts/code-review-recipe.md" },
        { file: "retrospective-recipe.md", template: "templates/prompts/retrospective-recipe.md" },
        { file: "prototype-recipe.md", template: "templates/prompts/prototype-recipe.md" },
        { file: "pull-request-template.md", template: "templates/prompts/pull-request-template.md" }
    ];

    for (const recipe of recipes) {
        try {
            const fullTemplatePath = path.join(getPackageRoot(), recipe.template);
            if (fs.existsSync(fullTemplatePath)) {
                const content = fs.readFileSync(fullTemplatePath, "utf8");
                writeTextFile(path.join(promptsPath, recipe.file), content);
            }
        } catch (e) {
            logger.debug(`Failed to scaffold prompt recipe: ${recipe.file}`, e);
        }
    }

    // Scaffold cli-commands.json
    const cliCommands = {
        commands: {
            init: { agent: "manager", description: "Initialize Atabey structure and AI configuration." },
            check: { agent: "quality", description: "Verify framework files and code quality discipline." },
            status: { agent: "manager", description: "Show the current status of the active project phase." },
            "trace:new": { agent: "manager", description: "Generate a new Trace ID to start a task sequence." },
            orchestrate: { agent: "manager", description: "Execute the Hermes message broker loop." },
            "verify-contract": { agent: "architect", description: "Validate type contracts between backend and frontend." },
            "update-contract": { agent: "architect", description: "Update the contract signature hash." }
        }
    };
    writeJsonFile(path.join(frameworkDir, "cli-commands.json"), cliCommands, dryRun);

    // Scaffold router/routing_rules.md
    const routerDir = path.join(frameworkDir, "router");
    if (!fs.existsSync(routerDir)) fs.mkdirSync(routerDir, { recursive: true });
    writeTextFile(path.join(routerDir, "routing_rules.md"), buildRoutingRules());

    // Scaffold registry/agent_registry.md
    const registryDir = path.join(frameworkDir, "registry");
    if (!fs.existsSync(registryDir)) fs.mkdirSync(registryDir, { recursive: true });
    writeTextFile(path.join(registryDir, "agent_registry.md"), buildAgentRegistry());

    // Scaffold observability files
    const obsDir = path.join(frameworkDir, "observability");
    if (!fs.existsSync(obsDir)) fs.mkdirSync(obsDir, { recursive: true });
    writeTextFile(path.join(obsDir, "audit_log.md"), "# [ATABEY] Atabey — Audit Log\n\n| Timestamp | Agent | Action | Trace ID | Status |\n|---|---|---|---|---|\n");
    writeJsonFile(path.join(obsDir, "metrics.json"), []);

    // Scaffold .env.example
    const envExamplePath = path.join(process.cwd(), ".env.example");
    if (!fs.existsSync(envExamplePath)) {
        // [SECURITY] MCP_HOST must default to the loopback interface — 0.0.0.0
        // would expose the hub (and its file tools) to the whole network.
        writeTextFile(envExamplePath, [
            "# Atabey — Environment Variables",
            "# NOTE: Atabey does not auto-load .env files; export these variables",
            "# in your shell or IDE launch environment instead.",
            "",
            "# Core Settings",
            "MCP_PORT=5858",
            "MCP_HOST=127.0.0.1",
            "NODE_ENV=development",
            "",
            "# Security",
            "# MCP_AUTH_TOKEN=",
            "",
            "# AI Provider Keys (optional — for embeddings)",
            "# OPENAI_API_KEY=",
            "",
        ].join("\n"));
    }

    // Scaffold rules
    const rulesDir = path.join(frameworkDir, "rules");
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
    writeTextFile(path.join(rulesDir, "global_rules.mdc"), `---
description: Global Rules for Atabey AL
globs: **/*
---

# [ATABEY] Atabey — Global AL Rules
`);
}
