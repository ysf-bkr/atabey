import fs from "fs";
import os from "os";
import path from "path";
import { VectorStore } from "../../modules/memory/vector-store.js";
import {
    DEFAULT_CONSUMER_PATHS,
    FRAMEWORK,
    FRAMEWORK_DIR_CANDIDATES,
    FRAMEWORK_MONOREPO_PATHS,
    MCP,
} from "../../shared/constants.js";
import { ensureDir, writeJsonFile, writeTextFile } from "../../shared/fs.js";
import { logger } from "../../shared/logger.js";
import { Storage, TaskRow } from "../../shared/storage.js";
import type { TraceID } from "../../shared/types.js";

export { generateULID } from "./time.js";

const CWD = process.cwd();
const HOME = os.homedir();

function findFrameworkDir(basePath: string): string | null {
    try {
        const pkgPath = path.join(basePath, "package.json");
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            if (pkg.atabey && typeof pkg.atabey.frameworkDir === "string") {
                const customDir = path.join(basePath, pkg.atabey.frameworkDir);
                if (fs.existsSync(customDir)) return customDir;
            }
        }
    } catch (err) {
        logger.debug("Failed to read package.json in findFrameworkDir", err);
    }
    return null;
}

export type ProjectKind = "framework-monorepo" | "consumer";

export function isAtabeyFrameworkMonorepo(basePath: string = CWD): boolean {
    try {
        const pkgPath = path.join(basePath, "package.json");
        if (!fs.existsSync(pkgPath)) return false;
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
            name?: string;
            private?: boolean;
            workspaces?: string[];
            atabey?: { frameworkRepo?: boolean };
        };
        if (pkg.atabey?.frameworkRepo === true) return true;
        if (pkg.name === "atabey-monorepo") return true;
        if (
            pkg.private &&
            Array.isArray(pkg.workspaces) &&
            pkg.workspaces.some((w) => w.includes("packages/atabey"))
        ) {
            return true;
        }
    } catch (err) {
        logger.debug("Failed to read package.json in isAtabeyFrameworkMonorepo", err);
    }
    return false;
}

export function detectProjectKind(basePath: string = CWD): ProjectKind {
    return isAtabeyFrameworkMonorepo(basePath) ? "framework-monorepo" : "consumer";
}

/** @deprecated Use isAtabeyFrameworkMonorepo */
export function isFrameworkDevelopmentRepo(): boolean {
    if (isAtabeyFrameworkMonorepo()) return true;
    try {
        const pkgPath = path.join(CWD, "package.json");
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            if (pkg.name === "atabey") return true;
        }
    } catch (err) {
        logger.debug("Failed to read package.json in isFrameworkDevelopmentRepo", err);
    }
    return false;
}

export type ProjectPaths = {
    backend: string;
    frontend: string;
    mobile: string;
    docs: string;
    tests: string;
};

export function resolveProjectPaths(basePath: string = CWD): ProjectPaths {
    if (detectProjectKind(basePath) === "framework-monorepo") {
        return { ...FRAMEWORK_MONOREPO_PATHS };
    }
    try {
        const frameworkDir = findFrameworkDir(basePath) || path.join(basePath, FRAMEWORK.CORE_DIR);
        const configPath = path.join(frameworkDir, "config.json");
        if (fs.existsSync(configPath)) {
            const raw = JSON.parse(fs.readFileSync(configPath, "utf8")) as { paths?: Partial<ProjectPaths> };
            if (raw.paths) return { ...DEFAULT_CONSUMER_PATHS, ...raw.paths };
        }
    } catch (err) {
        logger.debug("Failed to resolve project paths from config.json", err);
    }
    return { ...DEFAULT_CONSUMER_PATHS };
}

export function getLocalFrameworkDir(): string {
    const localDir = findFrameworkDir(CWD);
    return localDir || path.join(CWD, FRAMEWORK.CORE_DIR);
}

export function getConfigDir(): string {
    const localDir = findFrameworkDir(CWD);
    if (localDir) return localDir;

    // Check for standard local directories if package.json doesn't specify
    const localCandidates = [...FRAMEWORK_DIR_CANDIDATES, ".agent"] as string[];
    for (const cand of localCandidates) {
        const p = path.join(CWD, cand);
        if (fs.existsSync(p)) return p;
    }

    // In dev repo, don't fall back to global dir. Point to local default.
    if (isFrameworkDevelopmentRepo()) {
        return path.join(CWD, FRAMEWORK.CORE_DIR);
    }

    return path.join(HOME, FRAMEWORK.CORE_DIR);
}

export function getFrameworkDir(): string {
    const testDir = process.env[MCP.TEST_DIR_ENV];
    if (testDir) return testDir;
    return getConfigDir();
}

export function getDocumentStorePath() {
    const frameworkDir = getFrameworkDir();
    return path.join(frameworkDir, "memory");
}

async function indexKnowledgeBaseIntoVectorMemory(frameworkDir: string) {
    try {
        const { CoreMemory } = await import("../../modules/memory/core.js");
        const knowledgeDir = path.join(frameworkDir, "knowledge");
        if (fs.existsSync(knowledgeDir)) {
            const files = fs.readdirSync(knowledgeDir);
            for (const file of files) {
                if (file.endsWith(".md")) {
                    const filePath = path.join(knowledgeDir, file);
                    const content = fs.readFileSync(filePath, "utf8");
                    await CoreMemory.remember({
                        content,
                        category: "RULE",
                        filePath: path.relative(process.cwd(), filePath),
                        tags: ["knowledge", "standard"],
                    });
                }
            }
        }
    } catch (e) {
        logger.debug("Failed to automatically index knowledge base into vector store", e);
    }
}

export function initDocumentStore(frameworkDir?: string) {
    const storePath = frameworkDir ? path.join(frameworkDir, "memory") : getDocumentStorePath();
    ensureDir(storePath);
    ensureDir(path.join(storePath, "tasks"));
    ensureDir(path.join(storePath, "history"));

    const stateFile = path.join(storePath, "state.json");
    if (!fs.existsSync(stateFile)) {
        writeJsonFile(stateFile, { phase: "PHASE_0", traceId: "T-000", managerState: "ACTIVE" });
    }
    const statusFile = path.join(storePath, "status.json");
    if (!fs.existsSync(statusFile)) {
        writeJsonFile(statusFile, {});
    }

    // Initialize SQLite
    Storage.setMetadata("phase", "PHASE_0");
    Storage.setMetadata("traceId", "T-000");
    Storage.setMetadata("managerState", "ACTIVE");

    // Initialize Vector Memory for semantic search
    VectorStore.initialize();

    // Ensure the initial Markdown view is created
    syncMarkdownMemory(frameworkDir);

    // Auto-index knowledge base files into vector memory
    indexKnowledgeBaseIntoVectorMemory(frameworkDir || getFrameworkDir()).catch(() => {});
}

export function readState() {
    const phase = Storage.getMetadata("phase") || "PHASE_0";
    const traceId = Storage.getMetadata("traceId") || "T-000";
    const managerState = Storage.getMetadata("managerState") || "ACTIVE";
    return { phase, traceId, managerState };
}

export function readStatus() {
    const agents = Storage.getAllAgents();
    const status: Record<string, { state: string; task: string; lastUpdated: string }> = {};
    agents.forEach((a) => {
        const name = a.name.startsWith("@") ? a.name : `@${a.name}`;
        status[name] = { state: a.state, task: a.task, lastUpdated: a.last_updated };
    });
    return status;
}

export function listTasks() {
    return Storage.getTasks();
}

export function getMemoryPath(): string {
    return path.join(getDocumentStorePath(), "state.json");
}

export function readActiveTraceId(memoryContent: string): string | null {
    try {
        const state = JSON.parse(memoryContent);
        return state.traceId || null;
    } catch { /* ignore */
        return null;
    }
}

export function updateProjectMemory(section: string, content: string) {
    if (section === "HISTORY") {
        updateDocumentStore("history", { content }, new Date().toISOString().replace(/[:.]/g, "-"));
    } else {
        const state = (readState() as Record<string, string>) || {};
        state[section] = content;
        updateDocumentStore("state", state);
    }
}

export function initializeMemory(memoryPathOrBase: string, targetBaseOrDryRun?: string | boolean): void {
    const targetBase = typeof targetBaseOrDryRun === "string" ? targetBaseOrDryRun : memoryPathOrBase;
    initDocumentStore(targetBase);
    logger.info("[OK] Document store initialized.");
}

export function getConfiguredPaths(): ProjectPaths {
    return resolveProjectPaths(CWD);
}

export function updateDocumentStore(type: "state" | "task" | "history" | "status", data: unknown, id?: string | TraceID, frameworkDir?: string) {
    const storePath = frameworkDir ? path.join(frameworkDir, "memory") : getDocumentStorePath();
    ensureDir(storePath);

    switch (type) {
        case "state":
            writeJsonFile(path.join(storePath, "state.json"), data);
            break;
        case "status": {
            const status = data as Record<string, { state: string; task: string, lastUpdated?: string }>;
            for (const [agent, info] of Object.entries(status)) {
                Storage.updateAgentStatus(agent, info.state, info.task, info.lastUpdated);
            }
            break;
        }
        case "task": {
            Storage.saveTask(data as TaskRow);
            break;
        }
        case "history": {
            Storage.saveLog({
                agent: "@manager",
                action: "HISTORY_UPDATE",
                status: "SUCCESS",
                summary: (data as { content: string }).content,
            });
            break;
        }
    }

    // Auto-sync Markdown view after any change
    syncMarkdownMemory(frameworkDir);
}

/**
 * Single Source of Truth Bridge: JSON -> Markdown
 * Regenerates PROJECT_MEMORY.md from structured state.
 */
export function syncMarkdownMemory(fDir?: string) {
    const frameworkDir = fDir || getFrameworkDir();
    const storePath = path.join(frameworkDir, "memory");
    const mdPath = path.join(storePath, "PROJECT_MEMORY.md");

    try {
        const state = readState();
        const status = readStatus();
        const tasks = Storage.getTasks();

        if (!state) return;

        const lines = [
            "# [MEMORY] Agent Atabey — Project Memory",
            "",
            "## [STATE] Current State",
            `- **Phase:** ${state.phase || "PHASE_0"}`,
            `- **Trace ID:** ${state.traceId || "N/A"}`,
            `- **@manager state:** ${state.managerState || "ACTIVE"}`,
        ];

        // Add custom sections from state
        const internalFields = ["phase", "traceId", "managerState"];
        Object.entries(state).forEach(([key, value]) => {
            if (!internalFields.includes(key) && value) {
                lines.push("", `## [INFO] ${key}`, String(value));
            }
        });

        lines.push(
            "",
            "## [TASKS] Active Tasks",
            "| Trace ID | Task | Agent | Priority | Status |",
            "| :--- | :--- | :--- | :--- | :--- |",
        );

        tasks.forEach(t => {
            if (t.status !== "COMPLETED") {
                lines.push(`| ${t.traceId} | ${t.description} | ${t.agent} | ${t.priority} | ${t.status} |`);
            }
        });

        lines.push("", "## [AI] Agent Statuses");
        lines.push("| Agent | State | Active Task | Last Updated |");
        lines.push("| :--- | :--- | :--- | :--- |");

        for (const [agent, info] of Object.entries(status)) {
            const data = info;
            const displayAgent = agent.startsWith("@") ? agent : `@${agent}`;
            lines.push(`| ${displayAgent} | ${data.state} | ${data.task} | ${data.lastUpdated || "-"} |`);
        }

        lines.push("", "## [HISTORY]");

        // Add last 5 history items
        const historyDir = path.join(storePath, "history");
        if (fs.existsSync(historyDir)) {
            const histFiles = fs.readdirSync(historyDir)
                .filter(f => f.endsWith(".json"))
                .sort()
                .reverse()
                .slice(0, 10);

            histFiles.forEach(f => {
                const hist = JSON.parse(fs.readFileSync(path.join(historyDir, f), "utf8"));
                lines.push(`### ${f.replace(".json", "")}`);
                lines.push(hist.content);
                lines.push("");
            });
        }

        writeTextFile(mdPath, lines.join("\n"));
        logger.debug("Markdown memory synchronized.");
    } catch (err) {
        logger.debug("Markdown memory sync failed", err);
    }
}


export function acquireMemoryLock(lockPath: string): boolean {
    try {
        fs.writeFileSync(lockPath, String(Date.now()), { flag: "wx" });
        return true;
    } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === "EEXIST") {
            try {
                const stat = fs.statSync(lockPath);
                if (Date.now() - stat.mtimeMs > 10000) {
                    fs.unlinkSync(lockPath);
                    fs.writeFileSync(lockPath, String(Date.now()), { flag: "wx" });
                    return true;
                }
            } catch { /* ignore */
                // Ignore
            }
        }
        return false;
    }
}

export function releaseMemoryLock(lockPath: string): void {
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
}
