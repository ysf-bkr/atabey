import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "atabey-mcp/utils/security.js";
import { LogAgentActionArgs, ToolResult } from "../types.js";

export function handleLogAgentAction(projectRoot: string, args: LogAgentActionArgs): ToolResult {
    const { agent, action, traceId, status, summary } = args;
    const findings = args.findings ? args.findings.split(",").map(f => f.trim()) : [];

    const frameworkDir = resolveFrameworkDir(projectRoot);
    const agentName = agent.replace("@", "");
    const logPath = path.join(projectRoot, frameworkDir, "logs", `${agentName}.json`);

    const logEntry = {
        timestamp: new Date().toISOString(),
        agent,
        action,
        requestId: traceId,
        status,
        summary,
        findings
    };

    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, JSON.stringify(logEntry) + "\n");

    return { content: [{ type: "text", text: `[OK] Action logged for ${agent} to ${path.join(frameworkDir, "logs", `${agentName}.json`)}` }] };
}
