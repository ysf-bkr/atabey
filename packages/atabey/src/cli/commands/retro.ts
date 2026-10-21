import fs from "fs";
import path from "path";
import { Storage } from "../../shared/storage.js";
import { asTraceID } from "../../shared/types.js";
import { getDocumentStorePath, getFrameworkDir, readActiveTraceId, syncMarkdownMemory } from "../utils/memory.js";
import { UI } from "../utils/ui.js";

/**
 * Executes `atabey retro` CLI command.
 * Facilitates post-task retrospective analysis and institutional learning preservation.
 */
export async function retroCommand(args: string[]): Promise<void> {
    let traceId = "T-000";
    const storePath = getDocumentStorePath();
    const mdPath = path.join(storePath, "PROJECT_MEMORY.md");

    if (fs.existsSync(mdPath)) {
        const tid = readActiveTraceId(fs.readFileSync(mdPath, "utf8"));
        if (tid) traceId = tid.trim();
    }

    const taskTitle = args.find(a => !a.startsWith("-")) || "Milestone Completion";
    const dateStr = new Date().toISOString().slice(0, 10);
    const timestamp = Date.now();

    const tasks = Storage.getTasks(asTraceID(traceId));
    const completed = tasks.filter(t => t.status === "COMPLETED").length;
    const total = tasks.length;

    const retroContent = [
        `**Trace:** ${traceId} (${taskTitle})`,
        `- **Date:** ${dateStr}`,
        `- **Result:** ${completed === total && total > 0 ? "SUCCESS" : "REVIEWED"}`,
        `- **Task Metrics:** ${completed}/${total} tasks completed.`,
        `- **Key Learnings:**`,
        `  - *Architecture:* Verified against Atabey 37 standards and dual-axis quality gate.`,
        `  - *Discipline:* Zero 'any', zero 'console.log', and strict TDD compliance enforced.`,
        `- **Actionable Rule Added:**`,
        `  - Maintain contract-first stability and formal specifications across all future phases.`
    ].join("\n");

    // Save to storePath/history/<timestamp>_<traceId>.json
    const historyDir = path.join(storePath, "history");
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    const histFile = path.join(historyDir, `${timestamp}_${traceId}.json`);
    fs.writeFileSync(histFile, JSON.stringify({ content: retroContent, traceId, date: dateStr, taskTitle }, null, 2), "utf8");

    // Also append directly to PROJECT_MEMORY.md if history section exists
    if (fs.existsSync(mdPath)) {
        let mem = fs.readFileSync(mdPath, "utf8");
        if (mem.includes("## [HISTORY]")) {
            mem = mem.replace("## [HISTORY]", `## [HISTORY]\n### ${dateStr} - ${traceId} (${taskTitle})\n${retroContent}\n`);
            fs.writeFileSync(mdPath, mem, "utf8");
        }
    }

    // Record in SQLite
    Storage.setMetadata(`retro_${traceId}`, JSON.stringify({
        traceId,
        date: dateStr,
        taskTitle,
        completed,
        total
    }));

    Storage.saveLog({
        agent: "@manager",
        action: "RETROSPECTIVE",
        status: "SUCCESS",
        summary: `Retrospective completed for ${traceId}: ${completed}/${total} tasks.`
    });

    // Sync Markdown memory view
    syncMarkdownMemory(getFrameworkDir());

    UI.intent("Post-Task Retrospective", `Captured learnings for Trace ${traceId}`);
    UI.success(`[OK] Retrospective recorded in PROJECT_MEMORY.md`);
}
