/**
 * `submit_plan` — in-process plan intake.
 *
 * Regression: this handler used to shell out to `npx atabey plan:submit`, a
 * subcommand that does not exist (the CLI exposes `plan submit`). The CLI treats
 * an unknown command as natural language, so the call "succeeded" by forwarding
 * the JSON to @manager as a chat message — while `atabey plan list` stayed empty
 * and nothing was ever scheduled. Same failure class as the old
 * `update_project_memory` no-op: doing work through a CLI string instead of the
 * library API.
 *
 * The handler now validates with the same engine the CLI uses and writes the plan,
 * its tasks and the delegation messages through Storage directly, so the caller
 * gets a real error instead of a misleading success.
 */

import { PlanningEngine } from "atabey/src/modules/engines/planning-engine.js";
import type { PlanTask } from "atabey/src/modules/engines/types.js";
import { Storage } from "atabey-shared/storage.js";
import { asAgentID, asTaskID, asTraceID } from "atabey-shared/types.js";
import type { ToolResult } from "../types.js";
import type { TaskID, AgentID } from "atabey-mcp/utils/types.js";
import { logger } from "../../../shared/logger.js";

export interface SubmitPlanArgs {
    tasks: {
        id: TaskID;
        agent: AgentID;
        task: string;
        dependencies?: TaskID[];
        /** [C4] Verifiable completion conditions — required for every task. */
        acceptanceCriteria: string[];
    }[];
}

/** ULID-like id for the plan trace. Trace ids are opaque strings to Storage. */
function newTraceId(): string {
    const time = Date.now().toString(32).toUpperCase().padStart(10, "0");
    let random = "";
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < 16; i++) random += alphabet[Math.floor(Math.random() * alphabet.length)];
    return time + random;
}

export function handleSubmitPlan(projectRoot: string, args: SubmitPlanArgs): ToolResult {
    if (!args.tasks || !Array.isArray(args.tasks) || args.tasks.length === 0) {
        return {
            isError: true,
            content: [{ type: "text", text: "[ERROR] 'tasks' array is required for submit_plan." }],
        };
    }

    // The MCP schema already enforces this, but the handler is a plain exported
    // function (also called from tests and future CLI wiring), so validate the id
    // format here too instead of trusting the caller.
    const badId = args.tasks.find((t) => !/^TASK-[0-9]+$/.test(String(t.id)));
    if (badId) {
        return {
            isError: true,
            content: [{
                type: "text",
                text: `[ERROR] Invalid task id "${badId.id}": must follow the format 'TASK-001'.`,
            }],
        };
    }

    const tasks = args.tasks as unknown as PlanTask[];

    let plan;
    try {
        plan = PlanningEngine.createPlan(tasks);
    } catch (err) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Could not build the plan: ${(err as Error).message}` }],
        };
    }

    // Same gate as the CLI: a task without verifiable acceptance criteria is not
    // schedulable, because "done" would be unprovable.
    const validation = PlanningEngine.validatePlan(plan, { requireAcceptanceCriteria: true });
    if (!validation.valid) {
        return {
            isError: true,
            content: [{
                type: "text",
                text: "[ERROR] Invalid plan submission:\n" +
                    validation.errors.map((e: string) => ` - ${e}`).join("\n"),
            }],
        };
    }

    const traceId = newTraceId();

    try {
        Storage.setMetadata(`plan_${traceId}`, JSON.stringify(plan));

        for (const task of plan.tasks) {
            Storage.saveTask({
                id: asTaskID(task.id),
                traceId: asTraceID(traceId),
                description: task.task,
                agent: asAgentID(task.agent),
                priority: "NORMAL",
                status: "PENDING",
                dependencies: (task.dependencies ?? []) as unknown as string[],
            });

            Storage.saveMessage({
                from: asAgentID("@manager"),
                to: asAgentID(task.agent),
                category: "DELEGATION",
                content: JSON.stringify({
                    task: task.task,
                    id: task.id,
                    acceptanceCriteria: task.acceptanceCriteria,
                }),
                traceId: asTraceID(traceId),
                priority: "NORMAL",
                status: "PENDING",
                requiresApproval: false,
            } as Parameters<typeof Storage.saveMessage>[0]);
        }
    } catch (err) {
        logger.error("submit_plan persistence failed", err);
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Could not store the plan: ${(err as Error).message}` }],
        };
    }

    const summary = plan.tasks
        .map((t) => `  - ${t.id} → ${t.agent} (${t.dependencies?.length ? `after ${t.dependencies.join(", ")}` : "no deps"})`)
        .join("\n");

    return {
        content: [{
            type: "text",
            text: `[OK] Plan accepted (trace: ${traceId}) with ${plan.tasks.length} task(s):\n${summary}\n` +
                "Tasks are queued as PENDING delegations. Start 'atabey orchestrate' to run them.",
        }],
    };
}
