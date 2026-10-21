import fs from "fs";
import path from "path";
import { PlanningEngine } from "../../modules/engines/planning-engine.js";
import { PlanTask } from "../../modules/engines/types.js";
import { asTaskID } from "../../shared/types.js";
import { UI } from "../utils/ui.js";
import { submitPlanCommand } from "./plan.js";

/**
 * Parses markdown specification (specifically Section 6 Execution Dependency Graph)
 * into structured PlanTask items compatible with PlanningEngine.
 */
export function parseSpecToTasks(specContent: string): PlanTask[] {
    const lines = specContent.split("\n");
    const tasks: PlanTask[] = [];

    let inDependencySection = false;
    let currentTask: Partial<PlanTask> & { acceptanceCriteria?: string[] } | null = null;

    const commitCurrent = () => {
        if (currentTask && currentTask.task) {
            tasks.push({
                id: currentTask.id || asTaskID(`TASK_${String(tasks.length + 1).padStart(2, "0")}`),
                agent: currentTask.agent || "backend",
                task: currentTask.task,
                dependencies: currentTask.dependencies || [],
                acceptanceCriteria: currentTask.acceptanceCriteria && currentTask.acceptanceCriteria.length > 0
                    ? currentTask.acceptanceCriteria
                    : [`Fulfill specification criteria for ${currentTask.id || "task"}`]
            });
            currentTask = null;
        }
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect Dependency Section
        if (line.match(/^##\s+.*(?:Execution Dependency Graph|Tasks|Tickets|Dependency Graph)/i)) {
            inDependencySection = true;
            continue;
        } else if (inDependencySection && line.startsWith("## ")) {
            // New top-level section ends the dependency section
            inDependencySection = false;
            commitCurrent();
            continue;
        }

        if (!inDependencySection) continue;

        // 1. First check for criteria sub-bullets under current task
        const criteriaMatch = line.match(/^[-*]\s*(?:Criteria|Given|When|Then|Verifiable|Acceptance):\s*(.+)$/i);
        if (currentTask && criteriaMatch) {
            const criteriaText = criteriaMatch[1].trim();
            if (!currentTask.acceptanceCriteria) currentTask.acceptanceCriteria = [];
            currentTask.acceptanceCriteria.push(criteriaText);
            continue;
        }

        // 2. Parse task items like:
        // 1. `TASK_01`: Database migration & Kysely model updates (@database) [Depends on: TASK_00]
        // - `TASK_02`: Implement core domain service (@backend)
        const taskMatch = line.match(/^(?:(?:\d+\.|\*|-)\s+)?(?:`([^`]+)`|\[([^\]]+)\]|(TASK_[A-Za-z0-9_]+)):\s*(.+)$/i);
        if (taskMatch) {
            commitCurrent();

            const rawId = taskMatch[1] || taskMatch[2] || taskMatch[3];
            const rest = taskMatch[4];

            // Extract agent (e.g. (@database) or @backend)
            let agent = "backend";
            const agentMatch = rest.match(/@([a-z0-9_-]+)/i);
            if (agentMatch) {
                agent = agentMatch[1].toLowerCase();
            }

            // Extract dependencies (e.g. [Depends on: TASK_01, TASK_02])
            const deps: string[] = [];
            const depMatch = rest.match(/\[(?:Depends on|Blocked by|Dependencies):\s*([^\]]+)\]/i);
            if (depMatch) {
                const rawDeps = depMatch[1].split(/[,; ]+/);
                for (const d of rawDeps) {
                    const cleanD = d.replace(/[`@]/g, "").trim();
                    if (cleanD.length > 0) deps.push(cleanD);
                }
            }

            // Clean description
            const cleanDescription = rest
                .replace(/@([a-z0-9_-]+)/gi, "")
                .replace(/\[(?:Depends on|Blocked by|Dependencies):[^\]]+\]/gi, "")
                .replace(/\(\s*\)/g, "")
                .trim();

            currentTask = {
                id: asTaskID(rawId.trim()),
                agent,
                task: cleanDescription,
                dependencies: deps.map(d => asTaskID(d)),
                acceptanceCriteria: []
            };
        }
    }

    commitCurrent();
    return tasks;
}

/**
 * Handles `atabey spec [init|parse|submit]` and `atabey to-tickets` commands.
 */
export async function specCommand(args: string[]): Promise<void> {
    const sub = (args[0] || "help").toLowerCase();

    if (sub === "init" || sub === "new") {
        const title = args.slice(1).join(" ") || "New Feature Specification";
        const specsDir = path.join(process.cwd(), "docs", "specs");
        if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });

        const dateStr = new Date().toISOString().slice(0, 10);
        const fileName = `SPEC-${dateStr}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`;
        const filePath = path.join(specsDir, fileName);

        const templatePath = path.join(process.cwd(), "packages", "atabey", "templates", "prompts", "spec-generation-recipe.md");
        let content = `# [SPEC] ${title}\n\n**Date:** ${dateStr}\n**Status:** DRAFT\n\n## 1. Executive Summary\n- Problem statement\n\n## 2. User Stories & Acceptance Criteria\n- **Story 1:** Given x When y Then z\n\n## 3. Data Models\n\n## 4. API Endpoints\n\n## 5. Security & PII\n\n## 6. Execution Dependency Graph\n1. \`TASK_01\`: Initial contract and types (@architect)\n2. \`TASK_02\`: Service implementation (@backend) [Depends on: TASK_01]\n3. \`TASK_03\`: Dual-axis quality audit (@quality) [Depends on: TASK_02]\n`;

        if (fs.existsSync(templatePath)) {
            content = fs.readFileSync(templatePath, "utf8");
        }

        fs.writeFileSync(filePath, content, "utf8");
        UI.success(`[OK] Specification initialized at: docs/specs/${fileName}`);
        return;
    }

    if (sub === "parse" || sub === "to-tickets" || sub === "tickets") {
        const specFile = args[1] || args[0];
        if (!specFile || !fs.existsSync(specFile)) {
            UI.error(`Specification file not found: ${specFile || "(none specified)"}`);
            UI.info("Usage: atabey spec parse docs/specs/SPEC-001.md [--submit]");
            return;
        }

        const raw = fs.readFileSync(specFile, "utf8");
        const tasks = parseSpecToTasks(raw);

        if (tasks.length === 0) {
            UI.warning("No tasks found in Section 6 (Execution Dependency Graph).");
            return;
        }

        const plan = PlanningEngine.createPlan(tasks);
        const validation = PlanningEngine.validatePlan(plan, { requireAcceptanceCriteria: true });
        if (!validation.valid) {
            UI.warning("Plan validation detected potential issues:");
            validation.errors.forEach(e => UI.warning(` - ${e}`));
        }

        UI.intent("Spec to Tickets", `Extracted ${tasks.length} atomic task(s) from ${path.basename(specFile)}`);
        for (const t of tasks) {
            const depsStr = t.dependencies && t.dependencies.length > 0 ? ` [Depends on: ${t.dependencies.join(", ")}]` : "";
            UI.info(` - [${t.id}] @${t.agent}: ${t.task}${depsStr}`);
        }

        const shouldSubmit = args.includes("--submit") || args.includes("-s");
        if (shouldSubmit) {
            await submitPlanCommand(tasks);
        } else {
            UI.info("\nTo dispatch this plan into Atabey's execution pipeline, run:");
            UI.info(`  atabey spec parse ${specFile} --submit`);
        }
        return;
    }

    UI.intent("Atabey Specification Engine (to-spec / to-tickets)", "Available subcommands:");
    UI.info("  atabey spec init <title>                 Create a new SPEC template in docs/specs/");
    UI.info("  atabey spec parse <spec-file> [--submit] Parse SPEC execution graph into DAG tickets");
    UI.info("  atabey to-tickets <spec-file>            Alias for 'spec parse'");
}
