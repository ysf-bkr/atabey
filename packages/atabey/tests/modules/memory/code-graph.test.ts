import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CodeGraph, extractImports, extractSymbols } from "../../../src/modules/memory/code-graph.js";
import { Storage } from "../../../src/shared/storage.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-codegraph-" + Date.now());
const PROJECT_DIR = path.join(os.tmpdir(), "atabey-codegraph-proj-" + Date.now());

beforeAll(() => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });

    fs.writeFileSync(
        path.join(PROJECT_DIR, "src", "a.ts"),
        [
            'import { randomUUID } from "crypto";',
            'import type { Zed } from "./z";',
            "export interface User { id: string; }",
            "export class UserService {",
            "  getUser(): User | null { return null; }",
            "}",
            "export function makeUser(id: string): User { return { id }; }",
        ].join("\n"),
    );

    fs.writeFileSync(
        path.join(PROJECT_DIR, "src", "b.ts"),
        ["export type Status = \"ok\" | \"fail\";", "const helper = () => 1;"].join("\n"),
    );

    Storage.reset();
});

afterAll(() => {
    Storage.reset();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
});

describe("extractSymbols", () => {
    it("captures interfaces, classes, functions, types", () => {
        const syms = extractSymbols(
            [
                "export interface User { id: string; }",
                "export class UserService {}",
                'export type Status = "ok";',
                "export const go = () => 1;",
                "function internal() {}",
            ].join("\n"),
        );
        const names = syms.map((s) => s.name);
        expect(names).toEqual(expect.arrayContaining(["User", "UserService", "Status", "go", "internal"]));
        expect(syms.find((s) => s.name === "UserService")?.kind).toBe("class");
    });

    it("can exclude non-exported symbols", () => {
        const syms = extractSymbols("export const a = () => 1;\nconst b = () => 2;", false);
        expect(syms.map((s) => s.name)).toContain("a");
        expect(syms.map((s) => s.name)).not.toContain("b");
    });
});

describe("extractImports", () => {
    it("captures import and require specifiers", () => {
        const imports = extractImports(
            ['import { z } from "zod";', 'import "side-effect";', 'const x = require("fs");'].join("\n"),
        );
        expect(imports).toEqual(expect.arrayContaining(["zod", "side-effect", "fs"]));
    });
});

describe("CodeGraph.index", () => {
    it("indexes files and is incremental", () => {
        const first = CodeGraph.index(PROJECT_DIR);
        expect(first.scanned).toBe(2);
        expect(first.updated).toBe(2);
        expect(first.files).toBe(2);
        expect(first.symbols).toBeGreaterThanOrEqual(4);
        expect(first.imports).toBeGreaterThanOrEqual(2);

        // No changes → nothing re-parsed
        const second = CodeGraph.index(PROJECT_DIR);
        expect(second.scanned).toBe(2);
        expect(second.updated).toBe(0);

        // Change one file → exactly one updated
        fs.appendFileSync(path.join(PROJECT_DIR, "src", "b.ts"), "\nexport const extra = 42;\n");
        const third = CodeGraph.index(PROJECT_DIR);
        expect(third.updated).toBe(1);

        // Delete one file → one removed
        fs.rmSync(path.join(PROJECT_DIR, "src", "a.ts"));
        const fourth = CodeGraph.index(PROJECT_DIR);
        expect(fourth.removed).toBe(1);
        expect(fourth.files).toBe(1);
    });

    it("finds symbols by name", () => {
        CodeGraph.clear();
        CodeGraph.index(PROJECT_DIR);
        const hits = CodeGraph.find("Status");
        const hit = hits.find((h) => h.name === "Status");
        expect(hit).toBeDefined();
        expect(hit?.file).toContain("b.ts");
        expect(hit?.kind).toBe("type");
    });
});
