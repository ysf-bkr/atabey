import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { buildAgentHandoff, renderHandoffMarkdown } from "../../modules/contracts/handoff.js";
import { Storage } from "../../shared/storage.js";
import { asTraceID } from "../../shared/types.js";
import { getMemoryPath, readActiveTraceId } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

/**
 * Executes `atabey handoff` CLI command.
 * Freezes current session state, changed files, and task context into a structured handoff.
 */
export async function handoffCommand(args: string[]): Promise<void> {
    const memPath = getMemoryPath();
    let traceId = "T-000";
    if (fs.existsSync(memPath)) {
        const tid = readActiveTraceId(fs.readFileSync(memPath, "utf8"));
        if (tid) traceId = tid.trim();
    }

    // Inspect git status for changed files
    const changedFiles: string[] = [];
    try {
        const statusOutput = execSync("git status -s", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        const lines = statusOutput.split("\n");
        for (const l of lines) {
            const trimmed = l.trim();
            if (trimmed.length > 3) {
                const filePath = trimmed.slice(3).trim();
                if (filePath) changedFiles.push(filePath);
            }
        }
    } catch {
        // Git check non-fatal
    }

    // Parse options
    const fromAgent = args.find(a => a.startsWith("--from="))?.split("=")[1] || "developer";
    const toAgent = args.find(a => a.startsWith("--to="))?.split("=")[1] || "manager";
    const summaryArg = args.find(a => !a.startsWith("-")) || "Session context preservation & handoff";

    // Gather active tasks from Storage
    const activeTasks = Storage.getTasks(asTraceID(traceId));
    const openIssues = activeTasks
        .filter(t => t.status === "FAILED" || t.status === "PENDING")
        .map(t => ({
            description: `Task ${t.id}: ${t.description} (status: ${t.status})`,
            severity: (t.status === "FAILED" ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM"
        }));

    const nextSteps = activeTasks
        .filter(t => t.status === "PENDING")
        .map(t => `Execute ${t.id} (@${t.agent}): ${t.description}`);

    if (nextSteps.length === 0) {
        nextSteps.push("Review modified files with @quality dual-axis review", "Advance to release or milestone sign-off");
    }

    const handoff = buildAgentHandoff({
        traceId,
        fromAgent,
        toAgent,
        taskSummary: summaryArg,
        workPerformed: `Session concluded. ${changedFiles.length} file(s) modified in workspace.`,
        changedFiles,
        openIssues,
        nextSteps,
        status: openIssues.some(i => i.severity === "HIGH") ? "BLOCKED" : "HANDOFF"
    });

    const markdown = renderHandoffMarkdown(handoff);

    // Save to .atabey/memory/session-handoff.md
    const handoffPath = path.join(process.cwd(), ".atabey", "memory", "session-handoff.md");
    fs.mkdirSync(path.dirname(handoffPath), { recursive: true });
    fs.writeFileSync(handoffPath, markdown, "utf8");

    // Save metadata in SQLite
    Storage.setMetadata(`handoff_${traceId}`, JSON.stringify(handoff));

    UI.intent("Session Handoff", `Preserved active context for Trace ${traceId}`);
    process.stdout.write(`\n${markdown}\n\n`);
    UI.success(`[OK] Handoff frozen to: .atabey/memory/session-handoff.md`);
}
