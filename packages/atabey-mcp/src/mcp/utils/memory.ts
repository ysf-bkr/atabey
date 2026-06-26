import fs from "fs";
import os from "os";
import path from "path";

const CWD = process.cwd();
const HOME = os.homedir();

const FRAMEWORK = {
    CORE_DIR: ".atabey",
};

const FRAMEWORK_DIR_CANDIDATES = [
    ".atabey",
    ".agents",
    ".claude",
    ".gemini",
    ".grok",
    ".cursor",
];

const MCP = {
    TEST_DIR_ENV: "ATABEY_TEST_DIR",
};

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
    } catch {
        // ignore
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
    } catch {
        // ignore
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
