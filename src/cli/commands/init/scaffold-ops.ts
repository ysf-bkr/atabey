import fs from "fs";
import path from "path";
import { logger } from "../../../shared/logger.js";
import { writeJsonFile, writeTextFile } from "../../utils/fs.js";
import { getPackageRoot } from "../../utils/pkg.js";

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
        { file: "contract-design-recipe.md", template: "templates/prompts/contract-design-recipe.md" }
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
            init: { agent: "manager", description: "Initialize Agent Atabey structure and AI configuration." },
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
    writeTextFile(path.join(routerDir, "routing_rules.md"), "# [SIGNAL] Agent Atabey — Natural Language & Event Router\n\nRouting engine protocols defined here.");

    // Scaffold registry/agent_registry.md
    const registryDir = path.join(frameworkDir, "registry");
    if (!fs.existsSync(registryDir)) fs.mkdirSync(registryDir, { recursive: true });
    writeTextFile(path.join(registryDir, "agent_registry.md"), "# [ATABEY] Agent Atabey — AL Registry\n\nList of active agents.");

    // Scaffold observability files
    const obsDir = path.join(frameworkDir, "observability");
    if (!fs.existsSync(obsDir)) fs.mkdirSync(obsDir, { recursive: true });
    writeTextFile(path.join(obsDir, "audit_log.md"), "# [ATABEY] Agent Atabey — Audit Log\n\n| Timestamp | Agent | Action | Trace ID | Status |\n|---|---|---|---|---|\n");
    writeJsonFile(path.join(obsDir, "metrics.json"), []);

    // Scaffold .env.example
    const envExamplePath = path.join(process.cwd(), ".env.example");
    if (!fs.existsSync(envExamplePath)) {
        writeTextFile(envExamplePath, "# Agent Atabey - Environment Variables\n\n# Core Settings\nMCP_PORT=5858\nMCP_HOST=0.0.0.0\nNODE_ENV=development\n\n# Security\n# MCP_AUTH_TOKEN=\n\n# AI Provider Keys (optional - for embeddings)\n# OPENAI_API_KEY=\n");
    }

    // Scaffold rules
    const rulesDir = path.join(frameworkDir, "rules");
    if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
    writeTextFile(path.join(rulesDir, "global_rules.mdc"), `---
description: Global Rules for Agent Atabey AL
globs: **/*
---

# [ATABEY] Agent Atabey — Global AL Rules
`);
}
