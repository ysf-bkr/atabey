import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { UI } from "../utils/ui.js";

const WORKTREE_ROOT = ".atabey/worktrees";

function git(args: string[], cwd: string): string {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Agent workspace isolation: run experimental agent work in a dedicated git
 * worktree instead of the developer's live (possibly dirty) working tree.
 *
 * Usage:
 *   atabey worktree create <name>
 *   atabey worktree list
 *   atabey worktree remove <name> [--force]
 */
export async function worktreeCommand(args: string[]): Promise<void> {
    const sub = (args[0] || "list").toLowerCase();
    const cwd = process.cwd();
    const name = args[1];

    const assertGitRepo = (): boolean => {
        try {
            git(["rev-parse", "--is-inside-work-tree"], cwd);
            return true;
        } catch {
            UI.error("Not a git repository. Worktree isolation requires git.");
            return false;
        }
    };

    if (sub === "create") {
        if (!name || !/^[A-Za-z0-9._-]+$/.test(name)) {
            UI.error("Usage: atabey worktree create <name> (letters, digits, '.', '_', '-')");
            process.exitCode = 64;
            return;
        }
        if (!assertGitRepo()) return;
        const target = path.join(WORKTREE_ROOT, name);
        const absTarget = path.resolve(cwd, target);
        if (fs.existsSync(absTarget)) {
            UI.error(`Worktree path already exists: ${target}`);
            process.exitCode = 1;
            return;
        }
        try {
            git(["worktree", "add", "-b", `atabey/${name}`, target], cwd);
            UI.success(`Isolated worktree created: ${target} (branch atabey/${name})`);
            UI.info("Point experimental agent work at this directory; the main tree stays untouched.");
        } catch (e) {
            UI.error(`Failed to create worktree: ${(e as Error).message}`);
            process.exitCode = 1;
        }
        return;
    }

    if (sub === "remove" || sub === "rm") {
        if (!name) {
            UI.error("Usage: atabey worktree remove <name> [--force]");
            process.exitCode = 64;
            return;
        }
        const target = path.join(WORKTREE_ROOT, name);
        const force = args.includes("--force") ? ["--force"] : [];
        try {
            git(["worktree", "remove", ...force, target], cwd);
            UI.success(`Worktree removed: ${target}`);
        } catch (e) {
            UI.error(`Failed to remove worktree: ${(e as Error).message}`);
            process.exitCode = 1;
        }
        return;
    }

    if (sub === "list" || sub === "ls") {
        if (!assertGitRepo()) return;
        try {
            process.stdout.write(git(["worktree", "list"], cwd));
        } catch (e) {
            UI.error(`Failed to list worktrees: ${(e as Error).message}`);
            process.exitCode = 1;
        }
        return;
    }

    UI.error("Usage: atabey worktree <create|list|remove> [name] [--force]");
}
