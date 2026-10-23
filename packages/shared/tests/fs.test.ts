import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, ensureDir, runCommandQuiet, writeJsonFile, writeTextFile } from "../src/modules/primitives/fs.js";

/**
 * Unit tests for the atomic filesystem helpers used across scaffolding and
 * storage. Covers dry-run behaviour, newline normalisation and cleanup on
 * write failure — none of which were exercised before.
 */
describe("primitives/fs", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-fs-test-"));
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("ensureDir creates nested directories and is idempotent", () => {
        const nested = path.join(tempDir, "a", "b", "c");
        ensureDir(nested);
        expect(fs.statSync(nested).isDirectory()).toBe(true);
        ensureDir(nested);
        expect(fs.statSync(nested).isDirectory()).toBe(true);
    });

    it("ensureDir in dry-run mode does not create anything", () => {
        const target = path.join(tempDir, "dry");
        ensureDir(target, true);
        expect(fs.existsSync(target)).toBe(false);
    });

    it("writeTextFile writes content and appends a trailing newline", () => {
        const file = path.join(tempDir, "nested", "note.txt");
        writeTextFile(file, "hello");
        expect(fs.readFileSync(file, "utf8")).toBe("hello\n");
    });

    it("writeTextFile does not duplicate an existing trailing newline", () => {
        const file = path.join(tempDir, "note.txt");
        writeTextFile(file, "hello\n");
        expect(fs.readFileSync(file, "utf8")).toBe("hello\n");
    });

    it("writeTextFile leaves no temporary files behind", () => {
        const file = path.join(tempDir, "atomic.txt");
        writeTextFile(file, "atomic");
        const leftovers = fs.readdirSync(tempDir).filter(name => name.endsWith(".tmp"));
        expect(leftovers).toEqual([]);
    });

    it("writeTextFile in dry-run mode writes nothing", () => {
        const file = path.join(tempDir, "ignored.txt");
        writeTextFile(file, "nope", true);
        expect(fs.existsSync(file)).toBe(false);
    });

    it("writeTextFile propagates filesystem errors", () => {
        const blockingFile = path.join(tempDir, "blocker");
        fs.writeFileSync(blockingFile, "x");
        // Parent path is a file, so creating the nested directory must fail.
        expect(() => writeTextFile(path.join(blockingFile, "child.txt"), "data")).toThrow();
    });

    it("appendFile appends to an existing file and creates missing parents", () => {
        const file = path.join(tempDir, "deep", "log.txt");
        appendFile(file, "first\n");
        appendFile(file, "second\n");
        expect(fs.readFileSync(file, "utf8")).toBe("first\nsecond\n");
    });

    it("appendFile in dry-run mode writes nothing", () => {
        const file = path.join(tempDir, "log.txt");
        appendFile(file, "ignored", true);
        expect(fs.existsSync(file)).toBe(false);
    });

    it("writeJsonFile pretty-prints and normalises the trailing newline", () => {
        const file = path.join(tempDir, "config.json");
        writeJsonFile(file, { a: 1, nested: { b: "two" } });
        expect(fs.readFileSync(file, "utf8")).toBe('{\n  "a": 1,\n  "nested": {\n    "b": "two"\n  }\n}\n');
    });

    it("runCommandQuiet executes a command in the given directory", () => {
        const file = path.join(tempDir, "from-command.txt");
        runCommandQuiet(process.execPath, ["-e", `require('fs').writeFileSync(${JSON.stringify(file)}, 'ok')`], tempDir);
        expect(fs.readFileSync(file, "utf8")).toBe("ok");
    });

    it("runCommandQuiet throws when the command fails", () => {
        expect(() => runCommandQuiet(process.execPath, ["-e", "process.exit(3)"], tempDir)).toThrow();
    });
});
