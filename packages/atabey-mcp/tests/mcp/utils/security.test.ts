import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { safePath } from "../../../src/mcp/utils/security.js";

/**
 * safePath — path traversal confinement tests.
 *
 * safePath is the security boundary every file-system tool relies on. If it
 * regresses, an injected instruction could read/write outside the project.
 */
describe("safePath — path traversal confinement", () => {
    let root: string;
    let outside: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "safepath-root-"));
        outside = fs.mkdtempSync(path.join(os.tmpdir(), "safepath-out-"));
        fs.mkdirSync(path.join(root, "src"), { recursive: true });
        fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
        fs.rmSync(outside, { recursive: true, force: true });
    });

    it("allows paths inside the project root", () => {
        expect(safePath(root, "src/a.ts")).toBe(path.join(root, "src", "a.ts"));
        expect(safePath(root, "./src/a.ts")).toBe(path.join(root, "src", "a.ts"));
        expect(safePath(root, ".")).toBe(path.resolve(root));
    });

    it("rejects parent traversal (../)", () => {
        expect(() => safePath(root, "../secret.txt")).toThrow(/escapes project root/);
        expect(() => safePath(root, "src/../../etc/passwd")).toThrow(/escapes project root/);
    });

    it("rejects absolute paths outside the root", () => {
        expect(() => safePath(root, outside)).toThrow(/escapes project root/);
        expect(() => safePath(root, path.join(outside, "file.txt"))).toThrow(/escapes project root/);
    });

    it("rejects deep nested traversal that resolves outside", () => {
        expect(() => safePath(root, "src/../../../.." + path.sep + outside)).toThrow(/escapes project root/);
    });

    it("rejects a symlink that points outside the root", () => {
        const linkPath = path.join(root, "escape-link");
        fs.symlinkSync(outside, linkPath, "dir");
        expect(() => safePath(root, "escape-link/secret.txt")).toThrow(/escapes project root/);
    });

    it("allows a symlink that stays inside the root", () => {
        fs.symlinkSync(path.join(root, "src"), path.join(root, "src-link"), "dir");
        expect(safePath(root, "src-link/a.ts")).toBe(path.join(root, "src-link", "a.ts"));
    });
});
