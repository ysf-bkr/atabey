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
    let firstFoundCandidate: string | null = null;

    while (cur !== path.parse(cur).root) {
        const pkgJson = path.join(cur, "package.json");
        let isMonorepoRoot = false;
        if (fs.existsSync(pkgJson)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
                if (pkg.name === "atabey-monorepo" || pkg.frameworkRepo === true || (pkg.workspaces && Array.isArray(pkg.workspaces))) {
                    isMonorepoRoot = true;
                }
            } catch { /* ignore */ }
        }
        const candidate = path.join(cur, ".atabey");
        if (isMonorepoRoot) {
            return candidate;
        }
        if (fs.existsSync(candidate) && !firstFoundCandidate) {
            firstFoundCandidate = candidate;
        }
        cur = path.dirname(cur);
    }
    return firstFoundCandidate || path.join(process.cwd(), ".atabey");
}
