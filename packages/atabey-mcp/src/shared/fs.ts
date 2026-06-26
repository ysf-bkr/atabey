import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "./logger.js";

export function ensureDir(dirPath: string, dryRun = false): void {
    if (!fs.existsSync(dirPath)) {
        if (dryRun) {
            logger.info(`[DRY RUN] Would create directory: ${dirPath}`);
        } else {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }
}

/**
 * Writes content to a file atomically by using a temporary file.
 * This prevents data corruption during unexpected system failures.
 */
export function writeTextFile(filePath: string, content: string, dryRun = false): void {
    if (dryRun) {
        logger.info(`[DRY RUN] Would write file: ${filePath}`);
        return;
    }
    const dir = path.dirname(filePath);
    ensureDir(dir);

    const tempPath = `${filePath}.${Math.random().toString(36).slice(2, 9)}.tmp`;
    const finalContent = content.endsWith("\n") ? content : `${content}\n`;

    try {
        fs.writeFileSync(tempPath, finalContent, "utf8");
        fs.renameSync(tempPath, filePath);
    } catch (err) {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        throw err;
    }
}

export function appendFile(filePath: string, content: string, dryRun = false): void {
    if (dryRun) {
        logger.info(`[DRY RUN] Would append to file: ${filePath}`);
        return;
    }
    ensureDir(path.dirname(filePath));
    // Atomic append: oku → ekle → atomic yaz
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
    writeTextFile(filePath, existing + content);
}

export function writeJsonFile(filePath: string, value: unknown, dryRun = false): void {
    writeTextFile(filePath, JSON.stringify(value, null, 2), dryRun);
}

export function runCommandQuiet(command: string, args: string[], cwd: string): void {
    execFileSync(command, args, { cwd, stdio: "ignore" });
}
