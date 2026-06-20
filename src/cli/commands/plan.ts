import fs from "fs";
import path from "path";
import { PlanningEngine } from "../../modules/engines/planning-engine.js";
import { RoutingEngine } from "../../modules/engines/routing-engine.js";
import { PlanTask } from "../../modules/engines/types.js";
import { Storage, TaskRow } from "../../shared/storage.js";
import { asAgentID, asTaskID, asTraceID } from "../../shared/types.js";
import { generateULID } from "../utils/time.js";
import { UI } from "../utils/ui.js";
import { sendMessage } from "./orchestrate.js";

/**
 * Submits a structured plan (DAG) to the framework.
 */
export async function submitPlanCommand(tasks: PlanTask[]) {
    const traceId = asTraceID(generateULID());

    const plan = PlanningEngine.createPlan(tasks);
    const validation = PlanningEngine.validatePlan(plan);

    if (!validation.valid) {
        UI.error("Invalid Plan Submission:");
        validation.errors.forEach((e: string) => UI.error(` - ${e}`));
        process.exit(64);
    }

    UI.intent("Dynamic Task Planner", `Processing plan with ${plan.tasks.length} tasks (Plan Trace: ${traceId})`);

    // Save plan metadata to SQLite
    Storage.setMetadata(`plan_${traceId}`, JSON.stringify(plan));

    for (const task of plan.tasks) {
        const taskData: TaskRow = {
            id: asTaskID(task.id),
            traceId,
            description: task.task,
            agent: asAgentID(task.agent),
            priority: "NORMAL",
            status: "PENDING",
            dependencies: task.dependencies || []
        };
        Storage.saveTask(taskData);

        // Queue as a delegated message in SQLite
        await sendMessage({
            from: "@manager",
            to: task.agent,
            category: "DELEGATION",
            content: JSON.stringify({ task: task.task, traceId }),
            traceId,
            parentId: task.id,
            priority: "NORMAL",
            dependencies: task.dependencies || []
        });
    }

    UI.success(`[OK] Dynamic plan submitted and queued: ${plan.tasks.length} tasks.`);
}

/**
 * Reads ALL markdown files from the docs/ directory and creates
 * planning tasks from them. Agents will use this to understand
 * project requirements and generate code accordingly.
 */
export async function planCommand() {
    const projectRoot = process.cwd();
    const docsDir = path.join(projectRoot, "docs");

    if (!fs.existsSync(docsDir)) {
        UI.error("Docs directory not found at docs/");
        UI.info("TIP: Create a docs/ folder with your project requirements in .md files.");
        return;
    }

    const entries = fs.readdirSync(docsDir, { withFileTypes: true });
    const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith(".md"));

    if (mdFiles.length === 0) {
        UI.warning("No markdown files found in docs/ directory.");
        UI.info("TIP: Add .md files to docs/ with your project requirements.");
        return;
    }

    UI.intent("Planning Engine", `Reading ${mdFiles.length} document(s) from docs/...`);

    let totalTasks = 0;

    for (const file of mdFiles) {
        const filePath = path.join(docsDir, file.name);
        const content = fs.readFileSync(filePath, "utf8");
        const traceId = asTraceID(generateULID());

        UI.success(`[FILE] docs/${file.name} (Trace: ${traceId})`);

        // Extract checklist items and create sequential task chain
        const taskRegex = /- \[ \]\s+(.+)/g;
        let taskMatch;
        let taskCount = 0;
        let lastTaskId: string | null = null;

        while ((taskMatch = taskRegex.exec(content)) !== null) {
            const taskText = taskMatch[1].trim();
            if (taskText.length >= 3) {
                taskCount++;
                totalTasks++;

                // Smart routing via RoutingEngine
                const routingResult = RoutingEngine.resolveWithDetails(taskText);
                const targetAgent = routingResult.agent;
                process.stdout.write(`     [AGENT] ${targetAgent} (confidence: ${routingResult.confidence}, score: ${routingResult.score})\n`);
                const subTaskId = generateULID();

                const taskData: TaskRow = {
                    id: asTaskID(subTaskId),
                    traceId,
                    description: taskText,
                    agent: asAgentID(targetAgent),
                    priority: "NORMAL",
                    status: "PENDING",
                    dependencies: lastTaskId ? [lastTaskId] : []
                };
                Storage.saveTask(taskData);

                // Queue as a delegated message
                await sendMessage({
                    from: "@manager",
                    to: targetAgent,
                    category: "DELEGATION",
                    content: JSON.stringify({ task: taskText, traceId }),
                    traceId,
                    parentId: subTaskId,
                    priority: "NORMAL",
                    dependencies: lastTaskId ? [lastTaskId] : []
                });

                lastTaskId = subTaskId;
            }
        }

        process.stdout.write(`   [LIST] Actionable tasks detected: ${taskCount}\n`);
    }

    UI.success(`\n[OK] Planning complete: ${totalTasks} tasks identified.`);
}
