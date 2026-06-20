import { safeExec } from "../../utils/cli.js";
import { ToolResult } from "../types.js";
import { TaskID, AgentID } from "../../utils/types.js";

export interface SubmitPlanArgs {
    tasks: {
        id: TaskID;
        agent: AgentID;
        task: string;
        dependencies?: TaskID[];
    }[];
}

export function handleSubmitPlan(projectRoot: string, args: SubmitPlanArgs): ToolResult {
    if (!args.tasks || !Array.isArray(args.tasks)) {
        return {
            isError: true,
            content: [{ type: "text", text: "[ERROR] Error: 'tasks' array is required for submit_plan." }]
        };
    }

    const planJson = JSON.stringify(args.tasks);
    // Escape for shell if necessary, but safeExec handles arguments as an array
    const output = safeExec("npx", ["atabey", "plan:submit", planJson], projectRoot);
    
    return { content: [{ type: "text", text: output }] };
}
