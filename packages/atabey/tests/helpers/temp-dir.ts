import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/** packages/atabey/tests — all ephemeral test data stays under tests/.temp/ */
const TESTS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const TEMP_BASE = path.join(TESTS_ROOT, ".temp");

/** Creates an isolated directory under tests/.temp/ (never touches project root). */
export function createTestDir(prefix: string): string {
    fs.mkdirSync(TEMP_BASE, { recursive: true });
    return fs.mkdtempSync(path.join(TEMP_BASE, prefix));
}

export function removeTestDir(dir: string): void {
    if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}