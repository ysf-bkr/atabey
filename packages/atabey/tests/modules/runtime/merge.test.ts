import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mergeWorktreeChanges, resolveAgentWorktreePath } from "../../../src/modules/runtime/worktree.js";

let root: string;

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-merge-"));
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

function put(rel: string, content: string): void {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
}

describe("mergeWorktreeChanges", () => {
    it("applies non-conflicting agent files onto the main tree", () => {
        const wt = resolveAgentWorktreePath(root, "backend");
        put(path.relative(root, path.join(wt, "file_a.ts")), "export const a = 1;");
        put(path.relative(root, path.join(wt, "nested", "x.ts")), "export const x = 1;");

        const res = mergeWorktreeChanges(root, { backend: ["file_a.ts", "nested/x.ts"] });

        expect(res.merged).toBe(true);
        expect(res.appliedFiles).toEqual(["file_a.ts", "nested/x.ts"]);
        expect(fs.readFileSync(path.join(root, "file_a.ts"), "utf8")).toBe("export const a = 1;");
        expect(fs.existsSync(path.join(root, "nested", "x.ts"))).toBe(true);
    });

    it("deletes files that were removed in the worktree", () => {
        put("old.ts", "old content");
        fs.mkdirSync(resolveAgentWorktreePath(root, "backend"), { recursive: true });

        const res = mergeWorktreeChanges(root, { backend: ["old.ts"] });

        expect(res.merged).toBe(true);
        expect(res.deletedFiles).toContain("old.ts");
        expect(fs.existsSync(path.join(root, "old.ts"))).toBe(false);
    });

    it("refuses to merge when two agents touch the same file", () => {
        const res = mergeWorktreeChanges(root, { backend: ["shared.ts"], frontend: ["shared.ts"] });
        expect(res.merged).toBe(false);
        expect(res.conflicts).toContain("shared.ts");
    });

    it("ignores path-traversal and internal .atabey paths", () => {
        const wt = resolveAgentWorktreePath(root, "backend");
        fs.mkdirSync(wt, { recursive: true });
        const res = mergeWorktreeChanges(root, { backend: ["../escape.ts", ".atabey/config.json"] });
        expect(res.appliedFiles).toEqual([]);
        expect(fs.existsSync(path.join(path.dirname(root), "escape.ts"))).toBe(false);
    });
});
