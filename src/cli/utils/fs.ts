import crypto from "crypto";
import fs from "fs";
import path from "path";

import { appendFile, ensureDir, writeJsonFile, writeTextFile } from "../../shared/fs.js";
import type { AdapterId } from "../platforms/index.js";
import { remapFrameworkContent } from "../platforms/index.js";
import { UI } from "./ui.js";

export { appendFile, ensureDir, writeJsonFile, writeTextFile };

export function updateGitIgnore(targetPath: string, frameworkDir = ".atabey", dryRun = false): void {
    const IGNORE_LINES = [
        "# Agent Atabey",
        `${frameworkDir}/logs/*.json`,
        `${frameworkDir}/*.lock`,
        `${frameworkDir}/memory/`,
        ".env",
        ".DS_Store",
    ];

    let content = "";
    if (fs.existsSync(targetPath)) {
        content = fs.readFileSync(targetPath, "utf8");
    }

    const lines = content.split("\n").map((l) => l.trim());
    let added = false;

    for (const line of IGNORE_LINES) {
        if (!lines.includes(line)) {
            content += (content.endsWith("\n") || content === "" ? "" : "\n") + line + "\n";
            added = true;
        }
    }

    if (added) {
        if (dryRun) {
            UI.info(`[DRY RUN] Would update .gitignore at ${targetPath}`);
        } else {
            writeTextFile(targetPath, content);
            UI.success(" .gitignore updated.");
        }
    }
}


interface SanitizeJsonFunction {
  (obj: unknown, targetScope?: string): unknown;
}

export function copyDir(
    src: string,
    dest: string,
    skipSet = new Set<string>(),
    nonDestructive = false,
    frameworkDir = ".gemini",
    targetScope = "",
    sanitizeJson: SanitizeJsonFunction,
    adapterId: AdapterId = "gemini",
    dryRun = false,
): void {
    const DEFAULT_SKIP = new Set(["node_modules", ".git", ".DS_Store", "package-lock.json"]);
    const actualSkip = new Set([...DEFAULT_SKIP, ...skipSet]);

    if (!fs.existsSync(dest) && !dryRun) {
        fs.mkdirSync(dest, { recursive: true });
    }

    fs.readdirSync(src, { withFileTypes: true }).forEach((entry) => {
        if (actualSkip.has(entry.name)) return;

        const srcPath = path.join(src, entry.name);

        // Physical folder remapping during copy.
        // In unified mode (frameworkDir === ".atabey") folder names are always standard —
        // agents/ stays agents/, knowledge/ stays knowledge/.
        // Only remap when using a legacy non-unified adapter directory.
        let effectiveEntryName = entry.name;
        if (entry.isDirectory() && frameworkDir !== ".atabey") {
            if (entry.name === "agents") {
                if (adapterId === "antigravity-cli") effectiveEntryName = "skills";
                else if (adapterId === "grok") effectiveEntryName = "plugins";
            } else if (entry.name === "knowledge") {
                if (adapterId === "antigravity-cli") effectiveEntryName = "rules";
            }
        }

        const destPath = path.join(dest, effectiveEntryName);

        if (entry.isDirectory()) {
            copyDir(
                srcPath,
                destPath,
                skipSet,
                nonDestructive,
                frameworkDir,
                targetScope,
                sanitizeJson,
                adapterId,
                dryRun,
            );
        } else {
            if (nonDestructive && fs.existsSync(destPath)) {
                return;
            }

            const ext = path.extname(entry.name);
            const textExtensions = [".md", ".json", ".js", ".ts", ".txt", ""];

            if (textExtensions.includes(ext)) {
                let content = fs.readFileSync(srcPath, "utf8");
                content = remapFrameworkContent(content, frameworkDir, adapterId); // Use the new remap function

                if (ext === ".json") {
                    try {
                        const json = JSON.parse(content);
                        writeJsonFile(destPath, sanitizeJson(json, targetScope), dryRun);
                    } catch {
                        const fallback = content.replace(/workspace:[^"'\s]*/g, "*");
                        writeTextFile(destPath, fallback, dryRun);
                    }
                } else {
                    content = content.replace(/workspace:[^"'\s]*/g, "*");
                    content = remapFrameworkContent(content, frameworkDir, adapterId); // Apply remap once to the final content
                    writeTextFile(destPath, content, dryRun);
                }
            } else {
                if (dryRun) {
                    UI.info(`[DRY RUN] Would copy binary file: ${destPath}`);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }
    });
}

export function collectFiles(dir: string, extensions: string[]): string[] {
    let results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes("node_modules") && !file.includes(".git")) {
                results = results.concat(collectFiles(file, extensions));
            }
        } else if (extensions.includes(path.extname(file))) {
            results.push(file);
        }
    });
    return results;
}

export function computeTypesHash(projectRoot: string, sharedDir: string): string {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const fullPath = path.join(d, e.name);
        return e.isDirectory() ? walk(fullPath) : (e.name.endsWith(".ts") ? [fullPath] : []);
    });

    const hash = crypto.createHash("sha256");
    for (const filePath of walk(sharedDir).sort()) {
        hash.update(path.relative(projectRoot, filePath));
        hash.update("\0");
        hash.update(fs.readFileSync(filePath));
        hash.update("\0");
    }
    return hash.digest("hex");
}
