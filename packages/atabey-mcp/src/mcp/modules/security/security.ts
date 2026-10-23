import path from "path";
import fs from "fs";
import { FRAMEWORK, MCP, UNIFIED_HUB_DIR } from "../../constants.js"; // New import
import { logger } from "../../../shared/logger.js";

/**
 * Validates and resolves a user-provided path to prevent path traversal attacks.
 * Ensures the resolved path stays within the project root boundary.
 *
 * The comparison is case-insensitive and normalizes trailing separators so it
 * behaves correctly on Windows (where drive-letter roots and casing differ) as
 * well as POSIX. A symlink that points outside the root is also rejected by
 * comparing the fully-resolved real path when it exists.
 */
export function safePath(projectRoot: string, userPath: string): string {
    const normalizedRoot = path.resolve(projectRoot);
    const resolved = path.resolve(normalizedRoot, userPath);

    // Resolve symlinks on the deepest EXISTING ancestor so a symlink escape is
    // caught even when the final file does not exist yet. Comparing through a
    // single canonical root also avoids false "escapes" on macOS (/var symlink).
    const realRoot = fs.existsSync(normalizedRoot) ? fs.realpathSync(normalizedRoot) : normalizedRoot;

    let realResolved = resolved;
    let probe = resolved;
    while (probe !== path.dirname(probe)) {
        if (fs.existsSync(probe)) {
            realResolved = fs.realpathSync(probe) + resolved.slice(probe.length);
            break;
        }
        probe = path.dirname(probe);
    }

    const isInside = (target: string, root: string): boolean => {
        if (target === root) return true;
        const rel = path.relative(root, target);
        return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    };

    // Lexical confinement (blocks ../ traversal) AND real confinement (blocks
    // symlink escapes). Both must hold.
    const lexicalOk = isInside(resolved, normalizedRoot) || isInside(resolved, realRoot);
    const realOk = isInside(realResolved, realRoot) || isInside(realResolved, normalizedRoot);

    if (!lexicalOk || !realOk) {
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
                // [FIX] Segment-based containment: a naive `startsWith` let
                // SIBLING paths (e.g. /root/my-app-evil for root /root/my-app)
                // pass as "inside" the project.
                const rootAbs = path.resolve(projectRoot);
                const resolvedDir = path.resolve(rootAbs, atabeyConfig["frameworkDir"]);
                if (resolvedDir === rootAbs || resolvedDir.startsWith(rootAbs + path.sep)) {
                    return path.relative(rootAbs, resolvedDir);
                }
                return atabeyConfig["frameworkDir"];
            }
        }
    } catch (err) {
        logger.debug("Security module operation failed (non-fatal)", err);
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

    // 3. Fallback to local project directory (relative name).
    return FRAMEWORK.CORE_DIR;
}
