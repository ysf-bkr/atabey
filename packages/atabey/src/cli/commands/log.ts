import chalk from "chalk";
import { normalizeAgentName } from "../utils/string.js";
import { Storage } from "../../shared/storage.js";
import { UI } from "../utils/ui.js";

export async function logAgentActionCommand(data: {
    agent?: unknown;
    action?: string;
    requestId?: string;
    traceId?: string;
    status?: string;
    summary?: string;
    files?: string[];
    details?: Record<string, unknown>;
}): Promise<number> {
    const agent = normalizeAgentName(data.agent);

    return Storage.saveLog({
        agent,
        action: data.action || "ACTION",
        trace_id: data.traceId || undefined,
        status: data.status || "SUCCESS",
        summary: data.summary || "",
        findings: data.details ? JSON.stringify(data.details) : undefined
    });
}

export async function viewLogsCommand(options: { agent?: string; limit?: number } = {}): Promise<void> {
    const { agent, limit = 20 } = options;
    const normalizedAgent = agent ? normalizeAgentName(agent) : undefined;
    const logs = Storage.getLogs(normalizedAgent);

    if (logs.length === 0) {
        UI.info(normalizedAgent ? `No logs found for agent: @${normalizedAgent}` : "No logs found in database.");
        return;
    }

    const recent = logs.slice(0, limit);
    process.stdout.write(`\n[ATABEY] Agent Activity Logs (${recent.length} displayed of ${logs.length} total):\n`);
    UI.divider();

    for (const log of recent) {
        const time = new Date(log.timestamp).toLocaleString();
        const statusBadge = log.status === "SUCCESS"
            ? chalk.green(`[${log.status}]`)
            : log.status === "ERROR" || log.status === "FAILED"
            ? chalk.red(`[${log.status}]`)
            : chalk.yellow(`[${log.status}]`);
        const agentBadge = chalk.cyan(`@${log.agent}`);
        const trace = log.trace_id ? chalk.gray(`(${log.trace_id})`) : "";
        process.stdout.write(`[${chalk.gray(time)}] ${agentBadge} ${statusBadge} ${chalk.bold(log.action)} ${trace}\n`);
        if (log.summary) {
            process.stdout.write(`  ${chalk.white(log.summary)}\n`);
        }
        if (log.findings) {
            process.stdout.write(`  ${chalk.gray("Findings:")} ${chalk.gray(log.findings)}\n`);
        }
    }
    UI.divider();
}
