import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";

const WORKTREE_BASE = path.join(".atabey", "worktrees");

function isGitRepo(dir: string): boolean {
    try {
        execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: dir, stdio: "pipe" });
        return true;
    } catch {
        return false;
    }
}

/** Normalize an agent handle ("@backend") into a safe directory name. */
export function safeAgentDirName(agentName: string): string {
    return agentName.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Deterministic worktree path for an agent (whether or not it exists yet). */
export function resolveAgentWorktreePath(projectRoot: string, agentName: string): string {
    return path.join(projectRoot, WORKTREE_BASE, safeAgentDirName(agentName));
}

export interface WorktreeChanges {
    files: string[];
    diffStat: string;
}

/** Collect uncommitted changes inside a worktree (git status + diff --stat). */
export function collectWorktreeChanges(worktreePath: string): WorktreeChanges {
    try {
        const statusOut = execFileSync("git", ["status", "--porcelain"], {
            cwd: worktreePath,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const files = statusOut
            .split("\n")
            .map((line) => line.slice(3).trim())
            .filter(Boolean)
            .map((p) => (p.includes(" -> ") ? p.split(" -> ").pop()! : p));

        let diffStat = "";
        try {
            diffStat = execFileSync("git", ["diff", "--stat", "HEAD"], {
                cwd: worktreePath,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        } catch {
            /* no commits yet / detached — ignore */
        }
        return { files, diffStat };
    } catch {
        return { files: [], diffStat: "" };
    }
}

/** Files touched by more than one agent — collision candidates before merge. */
export function detectCollisions(changesByAgent: Record<string, string[]>): string[] {
    const owners = new Map<string, Set<string>>();
    for (const [agent, files] of Object.entries(changesByAgent)) {
        for (const f of files) {
            if (!owners.has(f)) owners.set(f, new Set());
            owners.get(f)!.add(agent);
        }
    }
    return [...owners.entries()]
        .filter(([, agents]) => agents.size > 1)
        .map(([file]) => file)
        .sort();
}

/**
 * Ensure an isolated git worktree for an agent under `.atabey/worktrees/<agent>`.
 *
 * - Reuses the worktree if it already exists.
 * - Returns the project root when worktrees are unavailable (non-git repo)
 *   unless `require` is set, in which case it throws (fail-closed).
 *
 * This is what prevents a parallel agent from clobbering the main working tree.
 */
export function ensureAgentWorktree(projectRoot: string, agentName: string, require = false): string {
    const name = safeAgentDirName(agentName);
    const base = path.join(projectRoot, WORKTREE_BASE);
    const wtPath = path.join(base, name);

    if (!isGitRepo(projectRoot)) {
        if (require) {
            throw new Error(
                `[WORKTREE] "${projectRoot}" is not a git repository; cannot create an isolated agent worktree.`,
            );
        }
        logger.warn("[WORKTREE] Not a git repo — agents run in the main tree (no isolation).");
        return projectRoot;
    }

    fs.mkdirSync(base, { recursive: true });
    if (fs.existsSync(path.join(wtPath, ".git"))) return wtPath;

    try {
        execFileSync("git", ["worktree", "add", "--detach", wtPath], { cwd: projectRoot, stdio: "pipe" });
        logger.info(`[WORKTREE] Created agent worktree: ${path.relative(projectRoot, wtPath)}`);
        return wtPath;
    } catch (e) {
        if (require) throw new Error(`[WORKTREE] Failed to create worktree: ${(e as Error).message}`, { cause: e });
        logger.warn(`[WORKTREE] Failed to create worktree, using main tree: ${(e as Error).message}`);
        return projectRoot;
    }
}

/**
 * Return the list of modified / untracked relative file paths inside an agent worktree.
 * Used by `AgentDispatcher` to detect cross-agent write collisions before merging.
 */
export function listWorktreeModifiedFiles(worktreePath: string): string[] {
    if (!isGitRepo(worktreePath)) return [];
    try {
        const out = execFileSync("git", ["status", "--porcelain", "-uall"], {
            cwd: worktreePath,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
        });
        return out
            .split(/\r?\n/)
            .map((line) => line.slice(3).trim())
            .filter((f) => f.length > 0 && !f.startsWith(".atabey/"));
    } catch {
        return [];
    }
}

export interface MergeWorktreeReport {
    merged: boolean;
    appliedFiles: string[];
    deletedFiles: string[];
    conflicts: string[];
}

/**
 * Safely apply non-conflicting uncommitted worktree changes from each agent
 * back to `projectRoot`. Refuses to apply anything if two agents touched the
 * same file (`conflicts.length > 0`).
 */
export function mergeWorktreeChanges(
    projectRoot: string,
    changesByAgent: Record<string, string[]>,
): MergeWorktreeReport {
    const conflicts = detectCollisions(changesByAgent);
    if (conflicts.length > 0) {
        return { merged: false, appliedFiles: [], deletedFiles: [], conflicts };
    }

    const appliedFiles: string[] = [];
    const deletedFiles: string[] = [];

    for (const [agent, files] of Object.entries(changesByAgent)) {
        const wtPath = resolveAgentWorktreePath(projectRoot, agent);
        if (!fs.existsSync(wtPath)) continue;

        const uniqueFiles = [...new Set(files)];
        for (const relPath of uniqueFiles) {
            if (relPath.startsWith(".atabey/") || relPath.includes("..")) continue;
            const srcPath = path.join(wtPath, relPath);
            const destPath = path.join(projectRoot, relPath);

            if (fs.existsSync(srcPath)) {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(srcPath, destPath);
                appliedFiles.push(relPath);
            } else if (fs.existsSync(destPath)) {
                fs.rmSync(destPath, { force: true });
                deletedFiles.push(relPath);
            }
        }
    }

    return {
        merged: true,
        appliedFiles: appliedFiles.sort(),
        deletedFiles: deletedFiles.sort(),
        conflicts: [],
    };
}


