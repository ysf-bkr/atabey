import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearReadCache, handleReadFile } from "../../../../src/mcp/tools/file_system/read_file.js";

describe("read_file file-hash guard", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-readcache-"));
        fs.mkdirSync(path.join(dir, ".atabey"), { recursive: true });
        clearReadCache();
    });
    afterEach(() => {
        clearReadCache();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("returns content on first read, a compact notice on the second unchanged read", () => {
        fs.writeFileSync(path.join(dir, "a.ts"), "export const x = 1;\n");
        const first = handleReadFile(dir, { path: "a.ts" });
        expect(first.content[0].text).toContain("export const x = 1;");

        const second = handleReadFile(dir, { path: "a.ts" });
        expect(second.content[0].text).toContain("[CACHE HIT]");
        expect(second.content[0].text).not.toContain("export const x = 1;");
    });

    it("re-reads after the file changes", () => {
        const p = path.join(dir, "b.ts");
        fs.writeFileSync(p, "export const y = 1;\n");
        handleReadFile(dir, { path: "b.ts" });
        fs.writeFileSync(p, "export const y = 2;\n");
        const res = handleReadFile(dir, { path: "b.ts" });
        expect(res.content[0].text).toContain("export const y = 2;");
        expect(res.content[0].text).not.toContain("[CACHE HIT]");
    });

    it("force:true bypasses the cache", () => {
        fs.writeFileSync(path.join(dir, "c.ts"), "export const z = 1;\n");
        handleReadFile(dir, { path: "c.ts" });
        const forced = handleReadFile(dir, { path: "c.ts", force: true });
        expect(forced.content[0].text).toContain("export const z = 1;");
    });
});
