import path from "path";
import fs from "fs";
import { FRAMEWORK, MCP, UNIFIED_HUB_DIR } from "../constants.js"; // New import
import os from "os"; // Need os.homedir()

/**
 * Validates and resolves a user-provided path to prevent path traversal attacks.
 * Ensures the resolved path stays within the project root boundary.
 */
export function safePath(projectRoot: string, userPath: string): string {
    const resolved = path.resolve(projectRoot, userPath);
    const normalizedRoot = path.resolve(projectRoot);

    if (!resolved.startsWith(normalizedRoot + path.sep) && resolved !== normalizedRoot) {
        throw new Error(`Access denied: path "${userPath}" escapes project root.`);
    }

    return resolved;
}

/**
 * Resolves the active framework directory.
 * Priority: ATABEY_TEST_DIR (env) -> package.json `atabey.frameworkDir` -> `.atabey` -> other adapter dirs -> global HOME.
 */
export function resolveFrameworkDir(projectRoot: string): string {
    // For test environments, use the explicitly set test directory.
    const testDir = process.env[MCP.TEST_DIR_ENV];
    if (testDir) return testDir;

    // 1. Authoritative source: read from package.json if present
    try {
        const pkgPath = path.join(projectRoot, "package.json");
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
            const atabeyConfig = pkg["atabey"] as Record<string, unknown> | undefined;
            if (atabeyConfig && typeof atabeyConfig["frameworkDir"] === "string") {
                // Ensure the path is relative if it's within the project, otherwise use as-is.
                const resolvedDir = path.resolve(projectRoot, atabeyConfig["frameworkDir"]);
                if (resolvedDir.startsWith(path.resolve(projectRoot))) {
                    return path.relative(projectRoot, resolvedDir);
                }
                return atabeyConfig["frameworkDir"];
            }
        }
    } catch {
        // ignore — fall through to filesystem scan
    }

    // 2. Filesystem scan in projectRoot for common framework directories
    const localCandidates = [
        FRAMEWORK.CORE_DIR, // .atabey
        UNIFIED_HUB_DIR,    // .agents
        // Add other adapter specific directories if needed, or remove if unified is strictly enforced
    ];

    for (const candidate of localCandidates) {
        const candidatePath = path.join(projectRoot, candidate);
        if (fs.existsSync(candidatePath)) {
            return candidate;
        }
    }

    // 3. Fallback to global home directory.
    const homeDir = os.homedir();
    return path.join(homeDir, FRAMEWORK.CORE_DIR);
}
