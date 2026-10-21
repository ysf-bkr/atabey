import { OrchestrateArgs, ToolResult } from "../types.js";
import { bootstrapOrchestrator } from "../../utils/orchestrator-bootstrap.js";

export async function handleOrchestrateLoop(projectRoot: string, _args: OrchestrateArgs): Promise<ToolResult> {
    const result = await bootstrapOrchestrator(projectRoot, { force: true });
    return {
        content: [{
            type: "text",
            text: result.started
                ? `Orchestrator active: ${result.message}`
                : `Orchestrator not started: ${result.message}`,
        }],
    };
}