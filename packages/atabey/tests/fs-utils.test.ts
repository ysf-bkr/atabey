import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDir, removeTestDir } from "./helpers/temp-dir.js";
import {
    collectFiles,
    computeTypesHash,
    copyDir,
    updateGitIgnore
} from "../src/cli/utils/fs.js";

describe("FileSystem Utilities", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = createTestDir("fs-utils-");
    });

    afterEach(() => {
        removeTestDir(tempDir);
    });

    describe("updateGitIgnore", () => {
        it("should create .gitignore and append all framework rules if file does not exist", () => {
            const gitignorePath = path.join(tempDir, ".gitignore");

            updateGitIgnore(gitignorePath, ".gemini", false);

            expect(fs.existsSync(gitignorePath)).toBe(true);
            const content = fs.readFileSync(gitignorePath, "utf8");
            expect(content).toContain("# Agent Atabey");
            expect(content).toContain(".gemini/logs/*.json");
            expect(content).toContain(".gemini/memory/");
        });

        it("should not append duplicate lines to an existing .gitignore", () => {
            const gitignorePath = path.join(tempDir, ".gitignore");
            fs.writeFileSync(gitignorePath, "# AI-Atabey\n.gemini/logs/*.json\n");

            updateGitIgnore(gitignorePath, ".gemini", false);

            const content = fs.readFileSync(gitignorePath, "utf8");
            // Count occurrences of '# AI-Atabey'
            const occurrences = (content.match(/# AI-Atabey/g) || []).length;
            expect(occurrences).toBe(1);
            expect(content).toContain(".gemini/*.lock"); // Added missing one
        });

        it("should respect dryRun mode", () => {
            const gitignorePath = path.join(tempDir, ".gitignore");
            const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

            updateGitIgnore(gitignorePath, ".gemini", true);

            expect(fs.existsSync(gitignorePath)).toBe(false);
            expect(stdoutSpy).toHaveBeenCalled();
            stdoutSpy.mockRestore();
        });
    });

    describe("collectFiles", () => {
        it("should return empty list if folder does not exist", () => {
            const files = collectFiles(path.join(tempDir, "non-existent"), [".ts"]);
            expect(files).toEqual([]);
        });

        it("should collect only files with matching extensions recursively", () => {
            const subDir = path.join(tempDir, "sub");
            fs.mkdirSync(subDir, { recursive: true });

            fs.writeFileSync(path.join(tempDir, "file1.ts"), "typescript");
            fs.writeFileSync(path.join(tempDir, "file2.js"), "javascript");
            fs.writeFileSync(path.join(subDir, "file3.ts"), "typescript in sub");
            // Dummy folders to check exclusion
            const nodeModules = path.join(tempDir, "node_modules");
            fs.mkdirSync(nodeModules, { recursive: true });
            fs.writeFileSync(path.join(nodeModules, "ignored.ts"), "typescript in node_modules");

            const files = collectFiles(tempDir, [".ts"]);
            expect(files).toHaveLength(2);
            expect(files.map(f => path.basename(f))).toContain("file1.ts");
            expect(files.map(f => path.basename(f))).toContain("file3.ts");
        });
    });

    describe("computeTypesHash", () => {
        it("should generate deterministic sha256 hash for typescript files in a directory", () => {
            const typesDir = path.join(tempDir, "types");
            fs.mkdirSync(typesDir, { recursive: true });

            fs.writeFileSync(path.join(typesDir, "a.ts"), "interface A {}");
            fs.writeFileSync(path.join(typesDir, "b.ts"), "interface B {}");

            const hash1 = computeTypesHash(tempDir, typesDir);
            const hash2 = computeTypesHash(tempDir, typesDir);

            expect(hash1).toBe(hash2);
            expect(hash1).toHaveLength(64); // SHA-256 is 64 hex characters

            // Modify a file, hash should change
            fs.writeFileSync(path.join(typesDir, "a.ts"), "interface A { id: number; }");
            const hash3 = computeTypesHash(tempDir, typesDir);
            expect(hash1).not.toBe(hash3);
        });
    });

    describe("copyDir", () => {
        it("should recursively copy directory and remap folders based on adapter", () => {
            const src = path.join(tempDir, "src");
            const dest = path.join(tempDir, "dest");
            fs.mkdirSync(path.join(src, "agents"), { recursive: true });
            fs.mkdirSync(path.join(src, "knowledge"), { recursive: true });

            fs.writeFileSync(path.join(src, "agents", "agent-spec.json"), JSON.stringify({ name: "spec" }));
            fs.writeFileSync(path.join(src, "knowledge", "rules.md"), "# Rules");

            const mockSanitizeJson = (obj: any) => obj;

            // Test with antigravity-cli adapter
            // agents -> skills, knowledge -> rules
            copyDir(
                src,
                dest,
                new Set(),
                false,
                ".gemini", // NOT .atabey to enable remapping
                "",
                mockSanitizeJson,
                "antigravity-cli",
                false
            );

            expect(fs.existsSync(path.join(dest, "skills", "agent-spec.json"))).toBe(true);
            expect(fs.existsSync(path.join(dest, "rules", "rules.md"))).toBe(true);
        });
    });
});
