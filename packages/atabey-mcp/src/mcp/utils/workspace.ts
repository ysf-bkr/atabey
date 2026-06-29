/**
 * [MCP] Workspace Manager — Multi-Developer Shared MCP Server
 *
 * Enables multiple developers to share a single MCP server instance
 * while maintaining isolated workspaces and shared project state.
 *
 * Architecture:
 * ┌─────────────────────────────────────────────────────┐
 * │                 Shared MCP Server                    │
 * │  ┌──────────────┐  ┌──────────────┐  ┌────────────┐│
 * │  │ Developer A   │  │ Developer B   │  │ Developer C ││
 * │  │ alice@corp    │  │ bob@corp      │  │ charlie@cor ││
 * │  ├──────────────┤  ├──────────────┤  ├────────────┤│
 * │  │ .atabey/A/   │  │ .atabey/B/   │  │ .atabey/C/ ││
 * │  │ logs/        │  │ logs/        │  │ logs/      ││
 * │  │ memory/      │  │ memory/      │  │ memory/    ││
 * │  │ messages/    │  │ messages/    │  │ messages/  ││
 * │  │ specialties/ │  │ specialties/ │  │ specialties││
 * │  └──────────────┘  └──────────────┘  └────────────┘│
 * │  ┌──────────────────────────────────────────────────┐│
 * │  │         Shared State (SQLite)                    ││
 * │  │  agents, tasks, logs, approvals, knowledge      ││
 * │  └──────────────────────────────────────────────────┘│
 * └─────────────────────────────────────────────────────┘
 *
 * Environment variables:
 *   ATABEY_PROJECT_ROOT  = /path/to/project (shared)
 *   MCP_AUTH_USERS       = alice:key1,bob:key2 (one per developer)
 *   MCP_USER             = auto-detected from auth token
 */

import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";

export interface DeveloperWorkspace {
    developerId: string;
    developerName: string;
    workspaceDir: string;
    logsDir: string;
    memoryDir: string;
    messagesDir: string;
    specialtiesDir: string;
    createdAt: string;
    lastActive: string;
}

/**
 * Workspace Manager — creates and manages per-developer workspaces
 * within the shared .atabey/ directory.
 *
 * Each developer gets:
 *   .atabey/workspaces/{developerId}/
 *     ├── logs/          → agent logs
 *     ├── memory/        → PROJECT_MEMORY.md, status.json
 *     ├── messages/      → Hermes message queue
 *     ├── specialties/   → learned conventions
 *     └── locks/         → file locks
 *
 * Shared state (SQLite):
 *   .atabey/atabey.db   → shared agents, tasks, approvals
 */
export class WorkspaceManager {
    private static readonly WORKSPACES_DIR = "workspaces";
    private static workspacesDir: string = "";

    /**
     * Initialize the workspace directory structure.
     */
    public static initialize(projectRoot: string): void {
        WorkspaceManager.workspacesDir = path.join(projectRoot, ".atabey", WorkspaceManager.WORKSPACES_DIR);

        if (!fs.existsSync(WorkspaceManager.workspacesDir)) {
            fs.mkdirSync(WorkspaceManager.workspacesDir, { recursive: true });
            process.stderr.write(`[WORKSPACE] Initialized workspaces at ${WorkspaceManager.workspacesDir}\n`);
        }
    }

    /**
     * Get or create a workspace for a developer.
     * Each developer is identified by their auth user name.
     */
    public static async getOrCreateWorkspace(developerName: string): Promise<DeveloperWorkspace> {
        WorkspaceManager.ensureInitialized();

        const developerId = WorkspaceManager.sanitizeId(developerName);
        const workspaceDir = path.join(WorkspaceManager.workspacesDir, developerId);

        if (!fs.existsSync(workspaceDir)) {
            fs.mkdirSync(workspaceDir, { recursive: true });
        }

        // Create subdirectories
        const logsDir = path.join(workspaceDir, "logs");
        const memoryDir = path.join(workspaceDir, "memory");
        const messagesDir = path.join(workspaceDir, "messages");
        const specialtiesDir = path.join(workspaceDir, "specialties");
        const locksDir = path.join(workspaceDir, "locks");

        for (const dir of [logsDir, memoryDir, messagesDir, specialtiesDir, locksDir]) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // Initialize default memory file if not exists
        const memoryFile = path.join(memoryDir, "PROJECT_MEMORY.md");
        if (!fs.existsSync(memoryFile)) {
            const now = new Date().toISOString();
            const content = `# PROJECT_MEMORY — ${developerName}\n\n` +
                `## Developer\n- Name: ${developerName}\n- Workspace: ${developerId}\n- Created: ${now}\n\n` +
                `## Active Session\n- Trace ID: N/A\n- Phase: PHASE_0\n- Status: READY\n\n` +
                `## Recent Activity\n- No activity yet.\n`;
            fs.writeFileSync(memoryFile, content, "utf8");
        }

        const workspace: DeveloperWorkspace = {
            developerId,
            developerName,
            workspaceDir,
            logsDir,
            memoryDir,
            messagesDir,
            specialtiesDir,
            createdAt: fs.statSync(workspaceDir).birthtime.toISOString(),
            lastActive: new Date().toISOString(),
        };

        // Log workspace access
        logger.debug(`[WORKSPACE] ${developerName} → ${developerId}`);

        return workspace;
    }

    /**
     * Get a workspace for a developer without creating it.
     * Returns null if the workspace doesn't exist.
     */
    public static getWorkspace(developerName: string): DeveloperWorkspace | null {
        WorkspaceManager.ensureInitialized();

        const developerId = WorkspaceManager.sanitizeId(developerName);
        const workspaceDir = path.join(WorkspaceManager.workspacesDir, developerId);

        if (!fs.existsSync(workspaceDir)) {
            return null;
        }

        const logsDir = path.join(workspaceDir, "logs");
        const memoryDir = path.join(workspaceDir, "memory");
        const messagesDir = path.join(workspaceDir, "messages");
        const specialtiesDir = path.join(workspaceDir, "specialties");

        return {
            developerId,
            developerName,
            workspaceDir,
            logsDir,
            memoryDir,
            messagesDir,
            specialtiesDir,
            createdAt: fs.statSync(workspaceDir).birthtime.toISOString(),
            lastActive: new Date().toISOString(),
        };
    }

    /**
     * List all developer workspaces.
     */
    public static listWorkspaces(): DeveloperWorkspace[] {
        WorkspaceManager.ensureInitialized();

        if (!fs.existsSync(WorkspaceManager.workspacesDir)) {
            return [];
        }

        const entries = fs.readdirSync(WorkspaceManager.workspacesDir, { withFileTypes: true });
        const workspaces: DeveloperWorkspace[] = [];

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const workspaceDir = path.join(WorkspaceManager.workspacesDir, entry.name);
                const workspace = WorkspaceManager.getWorkspace(entry.name);
                if (workspace) {
                    workspaces.push(workspace);
                }
            }
        }

        return workspaces;
    }

    /**
     * Get workspace statistics.
     */
    public static getStats(): {
        totalDevelopers: number;
        workspaces: Array<{ developerId: string; logCount: number; lastActive: string }>;
    } {
        const workspaces = WorkspaceManager.listWorkspaces();
        const stats = workspaces.map(w => {
            let logCount = 0;
            if (fs.existsSync(w.logsDir)) {
                logCount = fs.readdirSync(w.logsDir).filter(f => f.endsWith(".json") || f.endsWith(".log")).length;
            }
            return {
                developerId: w.developerId,
                logCount,
                lastActive: w.lastActive,
            };
        });

        return {
            totalDevelopers: workspaces.length,
            workspaces: stats,
        };
    }

    /**
     * Get the project root directory.
     */
    public static getProjectRoot(): string {
        return process.env.ATABEY_PROJECT_ROOT || process.cwd();
    }

    /**
     * Sanitize a developer name for use as a directory name.
     */
    private static sanitizeId(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, "_")
            .replace(/^_+|_+$/g, "")
            .substring(0, 64) || "anonymous";
    }

    private static ensureInitialized(): void {
        if (!WorkspaceManager.workspacesDir) {
            const projectRoot = WorkspaceManager.getProjectRoot();
            WorkspaceManager.initialize(projectRoot);
        }
    }
}
