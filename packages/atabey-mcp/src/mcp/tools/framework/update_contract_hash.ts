import { safeExec } from "atabey-mcp/utils/cli.js";
import { UpdateContractHashArgs, ToolResult } from "../types.js";

export function handleUpdateContractHash(projectRoot: string, args: UpdateContractHashArgs): ToolResult {
    const output = safeExec("npx", ["atabey", "contract", "update"], projectRoot, args.timeout);
    return { content: [{ type: "text", text: output }] };
}
