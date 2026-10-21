import fs from "fs";
import path from "path";
import { FRAMEWORK, FRAMEWORK_DIR_CANDIDATES, MCP } from "atabey-shared/constants.js";
import { logger } from "../../../shared/logger.js";

const CWD = process.cwd();

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
        logger.debug("Memory context operation failed (non-fatal)", err);
    }
    return null;
}

export function isFrameworkDevelopmentRepo(): boolean {
    try {
        const pkgPath = path.join(CWD, "package.json");
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
            if (pkg.name === "atabey") {
                return true;
            }
        }
    } catch (err) {
        logger.debug("Memory context operation failed (non-fatal)", err);
    }
    return false;
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

    return path.join(CWD, FRAMEWORK.CORE_DIR);
}

export function getFrameworkDir(): string {
    const testDir = process.env[MCP.TEST_DIR_ENV];
    if (testDir) return testDir;
    return getConfigDir();
}
