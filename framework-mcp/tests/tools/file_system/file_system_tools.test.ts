import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handlePatchFile } from "../../../src/tools/file_system/patch_file.js";
import { handleReadFile } from "../../../src/tools/file_system/read_file.js";
import { handleReplaceText } from "../../../src/tools/file_system/replace_text.js";
import { handleWriteFile } from "../../../src/tools/file_system/write_file.js";
import { ToolArgs } from "../../../src/tools/types.js";

import os from "os";

let TEST_DIR: string;
let TEST_FILE: string;
let MEMORY_DIR: string;
let MEMORY_FILE: string;

beforeEach(() => {
    TEST_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "fs-tools-test-"));
    fs.mkdirSync(path.join(TEST_DIR, ".atabey"));
    TEST_FILE = path.join(TEST_DIR, "test_file.txt");
    MEMORY_DIR = path.join(TEST_DIR, ".atabey/memory");
    MEMORY_FILE = path.join(MEMORY_DIR, "PROJECT_MEMORY.md");
});

afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("File System Tools", () => {

    describe("handleReplaceText", () => {
        it("should replace a single occurrence of text", async () => {
            fs.writeFileSync(TEST_FILE, "hello world", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                oldText: "world",
                newText: "there",
            };
            const result = await handleReplaceText(TEST_DIR, args as any);
            expect(result.content[0].text).toContain("[OK] Surgical edit successful in");
            expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("hello there\n");
        });

        it("should throw an error if text is not found", async () => {
            fs.writeFileSync(TEST_FILE, "hello world", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                oldText: "missing",
                newText: "found",
            };
            await expect(handleReplaceText(TEST_DIR, args as any)).rejects.toThrowError("Text not found in file");
        });

        it("should throw an error for ambiguous replacement if allowMultiple is false", async () => {
            fs.writeFileSync(TEST_FILE, "hello world world", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                oldText: "world",
                newText: "there",
                allowMultiple: false,
            };
            await expect(handleReplaceText(TEST_DIR, args as any)).rejects.toThrowError("Ambiguous replacement");
        });

        it("should replace all occurrences of text if allowMultiple is true", async () => {
            fs.writeFileSync(TEST_FILE, "hello world world", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                oldText: "world",
                newText: "there",
                allowMultiple: true,
            };
            const result = await handleReplaceText(TEST_DIR, args as any);
            expect(result.content[0].text).toContain("[OK] Surgical edit successful in");
            expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("hello there there\n");
        });

        it("should log usage to metrics.json upon replace", async () => {
            fs.writeFileSync(TEST_FILE, "hello world", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                oldText: "world",
                newText: "there",
            };
            await handleReplaceText(TEST_DIR, args as any);
            const metricsPath = path.join(TEST_DIR, ".atabey/observability/metrics.json");
            expect(fs.existsSync(metricsPath)).toBe(true);
            const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
            expect(metrics[0].action).toContain("replace_text");
        });
    });

    describe("handlePatchFile", () => {
        it("should replace lines in specified range", async () => {
            fs.writeFileSync(TEST_FILE, "line1\nline2\nline3\nline4", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                startLine: 2,
                endLine: 3,
                newContent: "patched2\npatched3",
            };
            const result = await handlePatchFile(TEST_DIR, args as any);
            expect(result.content[0].text).toContain("[OK] File patched successfully");
            expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("line1\npatched2\npatched3\nline4");
        });

        it("should throw an error for invalid start line", async () => {
            fs.writeFileSync(TEST_FILE, "line1\nline2", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                startLine: 5,
                endLine: 2,
                newContent: "error",
            };
            await expect(handlePatchFile(TEST_DIR, args as any)).rejects.toThrowError("Invalid start line");
        });

        it("should throw an error for invalid end line", async () => {
            fs.writeFileSync(TEST_FILE, "line1\nline2", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                startLine: 1,
                endLine: 5,
                newContent: "error",
            };
            await expect(handlePatchFile(TEST_DIR, args as any)).rejects.toThrowError("Invalid end line");
        });

        it("should log usage to metrics.json upon patch", async () => {
            fs.writeFileSync(TEST_FILE, "line1\nline2\nline3\nline4", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                startLine: 2,
                endLine: 3,
                newContent: "patched2\npatched3",
            };
            await handlePatchFile(TEST_DIR, args as any);
            const metricsPath = path.join(TEST_DIR, ".atabey/observability/metrics.json");
            expect(fs.existsSync(metricsPath)).toBe(true);
            const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
            expect(metrics[0].action).toContain("patch_file");
        });
    });

    describe("handleReadFile", () => {
        it("should read full file content", () => {
            fs.writeFileSync(TEST_FILE, "hello world", "utf8");
            const args: ToolArgs = { path: TEST_FILE };
            const result = handleReadFile(TEST_DIR, args as any);
            expect(result.content[0].text).toBe("hello world");
        });

        it("should read sliced lines", () => {
            fs.writeFileSync(TEST_FILE, "line1\nline2\nline3\nline4", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                startLine: 2,
                endLine: 3
            };
            const result = handleReadFile(TEST_DIR, args as any);
            expect(result.content[0].text).toBe("line2\nline3");
        });

        it("should block reading very long files without start/end lines (TOKEN ECONOMY)", () => {
            const longContent = Array.from({ length: 1005 }, (_, i) => `line ${i + 1}`).join("\n");
            fs.writeFileSync(TEST_FILE, longContent, "utf8");
            const args: ToolArgs = { path: TEST_FILE };
            const result = handleReadFile(TEST_DIR, args as any);
            expect(result.isError).toBe(true);
            expect(result.content[0].text).toContain("TOKEN ECONOMY GUARD");
            expect(result.content[0].text).toContain("too large");
        });
    });

    describe("handleWriteFile", () => {
        it("should write new file and log usage", async () => {
            const args: ToolArgs = {
                path: TEST_FILE,
                content: "hello world"
            };
            const result = await handleWriteFile(TEST_DIR, args as any);
            expect(result.content[0].text).toContain("[OK] File written:");
            expect(fs.readFileSync(TEST_FILE, "utf8")).toBe("hello world\n");
        });

        it("should write new file and log usage to metrics.json", async () => {
            const args: ToolArgs = {
                path: TEST_FILE,
                content: "hello world"
            };
            await handleWriteFile(TEST_DIR, args as any);
            const metricsPath = path.join(TEST_DIR, ".atabey/observability/metrics.json");
            expect(fs.existsSync(metricsPath)).toBe(true);
            const metrics = JSON.parse(fs.readFileSync(metricsPath, "utf8"));
            expect(metrics[0].action).toContain("write_file");
            expect(metrics[0].estimatedTokens).toBeGreaterThan(0);
        });

        it("should append update to PROJECT_MEMORY.md if it exists", async () => {
            fs.mkdirSync(MEMORY_DIR, { recursive: true });
            fs.writeFileSync(MEMORY_FILE, "## CURRENT STATUS\n", "utf8");
            const args: ToolArgs = {
                path: TEST_FILE,
                content: "hello world"
            };
            await handleWriteFile(TEST_DIR, args as any);
            const memoryContent = fs.readFileSync(MEMORY_FILE, "utf8");
            expect(memoryContent).toContain("Auto-Update");
            expect(memoryContent).toContain("wrote file");
        });
    });
});
