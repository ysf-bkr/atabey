import { safeExec } from "atabey-mcp/utils/cli.js";
import { UpdateContractHashArgs, ToolResult } from "../types.js";

export function handleUpdateContractHash(projectRoot: string, args: UpdateContractHashArgs): ToolResult {
    const output = safeExec("npx", ["atabey", "update-contract"], projectRoot, args.timeout);
    return { content: [{ type: "text", text: output }] };
}
