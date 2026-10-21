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
 * Safely merge uncommitted worktree changes from each agent back to `projectRoot`
 * using Git 3-way merge (`git merge-file -p` against `HEAD:<relPath>`).
 *
 * - Disjoint files are copied/deleted directly (or 3-way merged if `projectRoot`
 *   also diverged from `HEAD`).
 * - Files touched by multiple agents are 3-way merged against `HEAD:<relPath>`.
 *   Non-overlapping hunks merge cleanly; overlapping line conflicts abort the
 *   file merge and are reported in `conflicts`.
 */
export function mergeWorktreeChanges(
    projectRoot: string,
    changesByAgent: Record<string, string[]>,
): MergeWorktreeReport {
    const appliedFiles: string[] = [];
    const deletedFiles: string[] = [];
    const conflicts: string[] = [];

    const agentsByFile = new Map<string, string[]>();
    for (const [agent, files] of Object.entries(changesByAgent)) {
        for (const relPath of new Set(files)) {
            if (relPath.startsWith(".atabey/") || relPath.includes("..")) continue;
            if (!agentsByFile.has(relPath)) agentsByFile.set(relPath, []);
            agentsByFile.get(relPath)!.push(agent);
        }
    }

    const gitAvailable = isGitRepo(projectRoot);
    const tmpDir = path.join(projectRoot, WORKTREE_BASE, ".merge-tmp");

    const readHeadBlob = (relPath: string): string | null => {
        if (!gitAvailable) return null;
        try {
            return execFileSync("git", ["show", `HEAD:${relPath.replace(/\\/g, "/")}`], {
                cwd: projectRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            });
        } catch {
            return null;
        }
    };

    const threeWayMergeContent = (oursContent: string, baseContent: string, theirsContent: string): string | null => {
        fs.mkdirSync(tmpDir, { recursive: true });
        const oursFile = path.join(tmpDir, `ours-${process.pid}-${Date.now()}`);
        const baseFile = path.join(tmpDir, `base-${process.pid}-${Date.now()}`);
        const theirsFile = path.join(tmpDir, `theirs-${process.pid}-${Date.now()}`);
        try {
            fs.writeFileSync(oursFile, oursContent, "utf8");
            fs.writeFileSync(baseFile, baseContent, "utf8");
            fs.writeFileSync(theirsFile, theirsContent, "utf8");
            return execFileSync("git", ["merge-file", "-p", oursFile, baseFile, theirsFile], {
                cwd: projectRoot,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            });
        } catch {
            return null;
        } finally {
            fs.rmSync(oursFile, { force: true });
            fs.rmSync(baseFile, { force: true });
            fs.rmSync(theirsFile, { force: true });
        }
    };

    for (const [relPath, agents] of agentsByFile.entries()) {
        const destPath = path.join(projectRoot, relPath);

        if (agents.length === 1) {
            const wtPath = resolveAgentWorktreePath(projectRoot, agents[0]);
            if (!fs.existsSync(wtPath)) continue;
            const srcPath = path.join(wtPath, relPath);

            if (fs.existsSync(srcPath)) {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                const baseContent = readHeadBlob(relPath);
                const srcContent = fs.readFileSync(srcPath, "utf8");
                if (baseContent !== null && fs.existsSync(destPath)) {
                    const destContent = fs.readFileSync(destPath, "utf8");
                    if (destContent !== baseContent && destContent !== srcContent) {
                        const merged = threeWayMergeContent(destContent, baseContent, srcContent);
                        if (merged === null) {
                            conflicts.push(relPath);
                            continue;
                        }
                        fs.writeFileSync(destPath, merged, "utf8");
                        appliedFiles.push(relPath);
                        continue;
                    }
                }
                fs.copyFileSync(srcPath, destPath);
                appliedFiles.push(relPath);
            } else if (fs.existsSync(destPath)) {
                fs.rmSync(destPath, { force: true });
                deletedFiles.push(relPath);
            }
            continue;
        }

        // Multiple agents touched the same file — attempt true Git 3-way merge against HEAD
        const baseContent = readHeadBlob(relPath);
        const agentSources = agents.map((a) => path.join(resolveAgentWorktreePath(projectRoot, a), relPath));
        const allExist = agentSources.every((p) => fs.existsSync(p));

        if (!allExist || baseContent === null) {
            conflicts.push(relPath);
            continue;
        }

        let accContent = fs.existsSync(destPath) ? fs.readFileSync(destPath, "utf8") : baseContent;
        let conflictDetected = false;

        for (const srcPath of agentSources) {
            const theirsContent = fs.readFileSync(srcPath, "utf8");
            if (theirsContent === accContent) continue;
            const merged = threeWayMergeContent(accContent, baseContent, theirsContent);
            if (merged === null) {
                conflictDetected = true;
                break;
            }
            accContent = merged;
        }

        if (conflictDetected) {
            conflicts.push(relPath);
        } else {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
            fs.writeFileSync(destPath, accContent, "utf8");
            appliedFiles.push(relPath);
        }
    }

    return {
        merged: conflicts.length === 0,
        appliedFiles: appliedFiles.sort(),
        deletedFiles: deletedFiles.sort(),
        conflicts: conflicts.sort(),
    };
}


