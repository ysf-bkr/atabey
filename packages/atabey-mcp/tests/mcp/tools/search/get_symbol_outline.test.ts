import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleGetSymbolOutline } from "../../../../src/mcp/tools/search/get_symbol_outline.js";

const SAMPLE = `export function foo(a: string): number {
    return a.length;
}

function internal() {
    return 0;
}

export class Bar {
    method() {
        return 1;
    }
}

export interface Baz {
    x: number;
}

export type Qux = string;

export const arrow = (n: number) => n * 2;
`;

describe("get_symbol_outline", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-symbols-"));
        fs.writeFileSync(path.join(dir, "sample.ts"), SAMPLE);
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("lists exported symbols with line ranges", () => {
        const res = handleGetSymbolOutline(dir, { path: "sample.ts" });
        const text = res.content[0].text;
        expect(text).toContain("foo");
        expect(text).toContain("Bar");
        expect(text).toContain("Baz");
        expect(text).toContain("Qux");
        expect(text).toContain("arrow");
        expect(text).toContain("[exported]");
        // non-exported symbol omitted by default
        expect(text).not.toContain("internal");
    });

    it("includes non-exported symbols when requested", () => {
        const res = handleGetSymbolOutline(dir, { path: "sample.ts", includeNonExported: true });
        expect(res.content[0].text).toContain("internal");
    });

    it("filters by kind", () => {
        const res = handleGetSymbolOutline(dir, { path: "sample.ts", kind: "class" });
        const text = res.content[0].text;
        expect(text).toContain("Bar");
        expect(text).not.toContain("Baz");
    });
});
