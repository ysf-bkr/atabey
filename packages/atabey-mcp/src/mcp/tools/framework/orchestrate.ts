import { safeExec } from "atabey-mcp/utils/cli.js";
import { OrchestrateArgs, ToolResult } from "../types.js";

export function handleOrchestrateLoop(projectRoot: string, args: OrchestrateArgs): ToolResult {
    const output = safeExec("npx", ["atabey", "orchestrate"], projectRoot, args.timeout);
    return { content: [{ type: "text", text: output }] };
}
