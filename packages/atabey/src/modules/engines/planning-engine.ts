import { asPlanID, asTaskID } from "../../shared/types.js";
import { Plan, PlanTask } from "./types.js";
import { generateULID } from "../../cli/utils/time.js";
import { RoutingEngine } from "./routing-engine.js";

/**
 * [MAP] Planning Engine (The Strategist)
 * Responsible for decomposing complex requests into a DAG of atomic tasks.
 */
export class PlanningEngine {
    /**
     * Creates a new Plan structure.
     * In a real enterprise scenario, this would be fueled by an LLM prompt.
     * For now, it provides the structural backbone.
     */
    public static createPlan(rawTasks: { id?: string, task: string, agent?: string, dependencies?: string[] }[]): Plan {
        const planId = asPlanID(generateULID());
        const tasks: PlanTask[] = rawTasks.map((t, index) => {
            const id = t.id || `TASK_${String(index + 1).padStart(2, "0")}`;
            return {
                id: asTaskID(id),
                agent: t.agent || RoutingEngine.resolveAgent(t.task),
                task: t.task,
                dependencies: (t.dependencies || []).map(d => asTaskID(d))
            };
        });

        return {
            planId,
            tasks
        };
    }

    /**
     * Validates a plan's integrity (no circular dependencies, all agents valid).
     */
    public static validatePlan(plan: Plan): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const taskIds = new Set(plan.tasks.map(t => t.id));

        for (const task of plan.tasks) {
            // Check dependencies exist
            for (const dep of task.dependencies) {
                if (!taskIds.has(dep)) {
                    errors.push(`Task ${task.id} has non-existent dependency: ${dep}`);
                }
            }

            // Check circular dependencies (simple check for now)
            if (task.dependencies.includes(task.id)) {
                errors.push(`Task ${task.id} cannot depend on itself.`);
            }
        }

        // Circular dependency detection using DFS
        const visited = new Set<string>();
        const recStack = new Set<string>();

        const hasCycle = (taskId: string): boolean => {
            if (recStack.has(taskId)) return true;
            if (visited.has(taskId)) return false;

            visited.add(taskId);
            recStack.add(taskId);

            const task = plan.tasks.find(t => t.id === taskId);
            if (task) {
                for (const dep of task.dependencies) {
                    if (hasCycle(dep)) return true;
                }
            }

            recStack.delete(taskId);
            return false;
        };

        for (const task of plan.tasks) {
            if (hasCycle(task.id)) {
                errors.push("Circular dependency detected in plan.");
                break;
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }
}
