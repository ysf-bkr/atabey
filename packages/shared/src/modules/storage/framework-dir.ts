/**
 * Framework directory (.atabey) resolution shared by the storage domain modules.
 * Split from the original storage.ts (2026-10-20 audit, S7).
 */

import fs from "fs";
import os from "os";
import path from "path";

let vitestWorkerFrameworkDir: string | null = null;

function getVitestWorkerFrameworkDir(): string {
    if (!vitestWorkerFrameworkDir) {
        vitestWorkerFrameworkDir = path.join(os.tmpdir(), `atabey-vitest-worker-${process.pid}`, ".atabey");
    }
    return vitestWorkerFrameworkDir;
}

/**
 * Resolves the framework directory (.atabey) intelligently by ascending the directory tree,
 * preventing subpackages and test runners from spraying databases in random subfolders.
 *
 * Resolution order:
 *   1. ATABEY_TEST_DIR / ATABEY_FRAMEWORK_DIR (tests & explicit override)
 *   2. ATABEY_PROJECT_ROOT (set by the MCP server / IDE configs)
 *   3. NEAREST `.atabey` walking up from cwd.
 *
 * [FIX] The nearest `.atabey` now WINS over a monorepo root further up. The old
 * monorepo preference caused a split-brain: a consumer project initialized
 * inside a workspace (e.g. `test-app/` inside the Atabey repo) had its CLI
 * writes land in the PARENT repo's database while the MCP server (respecting
 * ATABEY_PROJECT_ROOT) read the child's — "indexed 84 files" but every search
 * came back empty. Workspace subpackages without their own `.atabey` still
 * resolve to the root's, so the original anti-spray behavior is preserved.
 */
export function resolveFrameworkDir(): string {
    const testDir = process.env.ATABEY_TEST_DIR || process.env.ATABEY_FRAMEWORK_DIR;
    if (testDir) return testDir;
    if (process.env.VITEST) {
        return getVitestWorkerFrameworkDir();
    }
    if (process.env.ATABEY_PROJECT_ROOT) {
        return path.join(process.env.ATABEY_PROJECT_ROOT, ".atabey");
    }

    let cur = process.cwd();
    while (cur !== path.parse(cur).root) {
        const candidate = path.join(cur, ".atabey");
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        cur = path.dirname(cur);
    }
    return path.join(process.cwd(), ".atabey");
}
