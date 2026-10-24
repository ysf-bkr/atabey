import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleGrepSearch } from "../../../../src/mcp/tools/search/grep_search.js";

/**
 * `includePattern` was documented as a glob but implemented as
 * `filePath.endsWith(pattern)`, so every wildcard pattern silently matched
 * nothing. These tests pin the glob semantics and the binary-file skip, both of
 * which were found by driving the published package over MCP.
 */
describe("grep_search", () => {
    let dir: string;

    const write = (rel: string, content: string) => {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content, "utf8");
    };

    const search = (args: Record<string, unknown>) => handleGrepSearch(dir, args as never);

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-grep-"));
        write("package.json", '{"name":"root","private":true}');
        write(".mcp.json", '{"mcpServers":{},"private":false}');
        write("apps/a/package.json", '{"name":"a","private":true}');
        write("apps/a/src/index.ts", "// marker\nconst x = 1;");
        write("apps/b/readme.md", "marker");
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("finds matches with no include pattern", () => {
        const res = search({ pattern: "marker" });
        expect(res.isError).toBeUndefined();
        const text = res.content[0].text as string;
        expect(text).toContain("index.ts");
        expect(text).toContain("readme.md");
    });

    it("treats a plain suffix as a suffix (backwards compatible)", () => {
        const res = search({ pattern: "marker", includePattern: ".ts" });
        const text = res.content[0].text as string;
        expect(text).toContain("index.ts");
        expect(text).not.toContain("readme.md");
    });

    it("supports a recursive ** glob", () => {
        const res = search({ pattern: "private", includePattern: "**/*.json" });
        const text = res.content[0].text as string;
        // root + .mcp.json + apps/a/package.json
        expect(text).toContain("package.json");
        expect(text).toContain("apps/a/package.json");
        expect(text).toContain(".mcp.json");
    });

    it("keeps a single * scoped to one path segment", () => {
        const res = search({ pattern: "private", includePattern: "*.json" });
        const text = res.content[0].text as string;
        expect(text).toContain(".mcp.json");
        expect(text).not.toContain("apps/a/package.json");
    });

    it("supports ? as a single character", () => {
        const res = search({ pattern: "private", includePattern: "*.jso?" });
        expect(res.content[0].text as string).toContain(".mcp.json");
    });

    it("returns no matches when the glob excludes everything", () => {
        const res = search({ pattern: "private", includePattern: "**/*.rs" });
        expect(res.content[0].text as string).toContain("No matches found");
    });

    it("skips binary files instead of matching their raw bytes", () => {
        fs.writeFileSync(path.join(dir, "dump.db"), Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x00, 0x6d, 0x61, 0x72, 0x6b, 0x65, 0x72]));
        const res = search({ pattern: "marker" });
        const text = res.content[0].text as string;
        expect(text).not.toContain("dump.db");
    });

    it("never descends into node_modules, dist or .git", () => {
        write("node_modules/pkg/index.js", "marker");
        write("dist/bundle.js", "marker");
        write(".git/objects/x", "marker");
        const text = search({ pattern: "marker" }).content[0].text as string;
        expect(text).not.toContain("node_modules");
        expect(text).not.toContain("dist/bundle.js");
        expect(text).not.toContain(".git/");
    });

    it("rejects an invalid regex with a clear error", () => {
        const res = search({ pattern: "([unclosed" });
        expect(res.isError).toBe(true);
        expect(res.content[0].text).toContain("Invalid regex pattern");
    });
});
