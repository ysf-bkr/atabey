import fs from "fs";
import path from "path";

/**
 * Ensures directory existence.
 */
export function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Atomically writes a text file.
 * Uses a temp file + rename pattern to prevent partial writes.
 * Compatible with src/shared/fs.ts writeTextFile API.
 */
export function writeTextFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    ensureDir(dir);

    const tempPath = `${filePath}.${Math.random().toString(36).slice(2, 9)}.tmp`;
    const finalContent = content.endsWith("\n") ? content : `${content}\n`;

    try {
        fs.writeFileSync(tempPath, finalContent, "utf8");
        fs.renameSync(tempPath, filePath);
    } catch (err) {
        if (fs.existsSync(tempPath)) {
            try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
        }
        throw err;
    }
}

/** @deprecated Use writeTextFile instead */
export const writeTextFileAtomic = writeTextFile;

/**
 * Appends content to a file. Creates parent directories if missing.
 * Compatible with src/shared/fs.ts appendFile API.
 */
export function appendFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    fs.appendFileSync(filePath, content, "utf8");
}

/** @deprecated Use appendFile instead */
export const appendFileSafe = appendFile;
