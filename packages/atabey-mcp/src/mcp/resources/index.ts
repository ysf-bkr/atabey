import { Storage, AgentRow, TaskRow } from "../utils/storage.js";

/**
 * [DATA] MCP Resource Definitions
 */
export const RESOURCES = [
    {
        uri: "atabey://AL/status",
        name: "AL Registry Status",
        description: "Real-time state and active tasks of all specialized agents.",
        mimeType: "text/markdown"
    },
    {
        uri: "atabey://plan/active",
        name: "Active Execution Plan",
        description: "The current DAG of tasks and their completion status.",
        mimeType: "text/markdown"
    },
    {
        uri: "atabey://memory/project",
        name: "Project Memory",
        description: "The central source of truth for project context (PROJECT_MEMORY.md).",
        mimeType: "text/markdown"
    }
];

export async function handleReadResource(uri: string): Promise<string> {
    if (uri === "atabey://AL/status") {
        const agents = Storage.getAllAgents();
        let md = "# [AI] AL Registry Status\n\n| Agent | State | Active Task | Last Updated |\n| :--- | :--- | :--- | :--- |\n";
        agents.forEach((a: AgentRow) => {
            md += `| @${a.name} | ${a.state} | ${a.task} | ${a.last_updated} |\n`;
        });
        return md;
    }

    if (uri === "atabey://plan/active") {
        const tasks = Storage.getTasks();
        let md = "# [LIST] Active Execution Plan\n\n| ID | Task | Agent | Status | Dependencies |\n| :--- | :--- | :--- | :--- | :--- |\n";
        tasks.forEach((t: TaskRow) => {
            const deps = t.dependencies.join(", ") || "-";
            md += `| ${t.id} | ${t.description} | ${t.agent} | ${t.status} | ${deps} |\n`;
        });
        return md;
    }

    if (uri === "atabey://memory/project") {
        const fs = await import("fs");
        const path = await import("path");
        const { getFrameworkDir } = await import("../utils/memory.js");
        
        const projectRoot = process.env.ATABEY_PROJECT_ROOT || process.cwd();
        const fwDir = getFrameworkDir();
        const p = path.isAbsolute(fwDir)
            ? path.join(fwDir, "memory", "PROJECT_MEMORY.md")
            : path.join(projectRoot, fwDir, "memory", "PROJECT_MEMORY.md");
        
        if (fs.existsSync(p)) {
            return fs.readFileSync(p, "utf8");
        }
        return "Project memory not found. Run 'atabey init' first.";
    }

    throw new Error(`Unknown resource URI: ${uri}`);
}
