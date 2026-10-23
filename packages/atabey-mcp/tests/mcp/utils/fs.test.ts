import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, ensureDir, writeTextFile } from "../../../src/mcp/utils/fs.js";

/**
 * Atomic write helpers used by MCP tools. The previous suite covered file tool
 * behaviour indirectly; these assert the helper contract directly (newline
 * normalisation, temp-file cleanup, error propagation).
 */
describe("mcp utils/fs", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-mcp-fs-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("ensureDir creates nested directories and is idempotent", () => {
        const nested = path.join(dir, "x", "y");
        ensureDir(nested);
        ensureDir(nested);
        expect(fs.statSync(nested).isDirectory()).toBe(true);
    });

    it("writeTextFile creates parents, normalises newline and leaves no temp files", () => {
        const file = path.join(dir, "deep", "file.txt");
        writeTextFile(file, "content");
        expect(fs.readFileSync(file, "utf8")).toBe("content\n");
        expect(fs.readdirSync(path.dirname(file)).filter(f => f.endsWith(".tmp"))).toEqual([]);
    });

    it("writeTextFile does not add a second newline", () => {
        const file = path.join(dir, "file.txt");
        writeTextFile(file, "content\n");
        expect(fs.readFileSync(file, "utf8")).toBe("content\n");
    });

    it("writeTextFile throws when the target cannot be written", () => {
        const blocker = path.join(dir, "blocker");
        fs.writeFileSync(blocker, "x");
        expect(() => writeTextFile(path.join(blocker, "child.txt"), "data")).toThrow();
    });

    it("appendFile appends without truncating", () => {
        const file = path.join(dir, "nested", "log.txt");
        appendFile(file, "a");
        appendFile(file, "b");
        expect(fs.readFileSync(file, "utf8")).toBe("ab");
    });
});
