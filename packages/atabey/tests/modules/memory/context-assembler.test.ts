import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CodeGraph } from "../../../src/modules/memory/code-graph.js";
import { ContextAssembler, formatContextBundle, extractKeywords } from "../../../src/modules/memory/context-assembler.js";
import { Storage } from "../../../src/shared/storage.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-ctx-" + Date.now());
const PROJECT_DIR = path.join(os.tmpdir(), "atabey-ctx-proj-" + Date.now());

beforeAll(() => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });

    const padding = Array.from({ length: 80 }, (_, i) => `  // filler line ${i}`).join("\n");
    fs.writeFileSync(
        path.join(PROJECT_DIR, "src", "auth.ts"),
        [
            "export class AuthService {",
            "  login(username: string): boolean {",
            padding,
            "    return username.length > 0;",
            "  }",
            "}",
        ].join("\n"),
    );
    fs.writeFileSync(
        path.join(PROJECT_DIR, "src", "user.ts"),
        ["export interface User { id: string; }", "export function createUser(id: string): User { return { id }; }"].join("\n"),
    );

    Storage.reset();
    CodeGraph.clear();
    CodeGraph.index(PROJECT_DIR);
});

afterAll(() => {
    Storage.reset();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
});

describe("extractKeywords", () => {
    it("drops stopwords and splits camelCase", () => {
        const kw = extractKeywords("Add rate limiting to AuthService login handler");
        const lower = kw.map((k) => k.toLowerCase());
        expect(lower).toContain("authservice");
        expect(lower).not.toContain("add");
        expect(lower).not.toContain("to");
    });
});

describe("ContextAssembler.assemble", () => {
    it("assembles a targeted bundle from the code graph", () => {
        const bundle = ContextAssembler.assemble(PROJECT_DIR, "Add rate limiting to AuthService login");
        const names = bundle.symbols.map((s) => s.name);
        expect(names).toContain("AuthService");
        expect(bundle.matchedFiles).toContain(path.join("src", "auth.ts"));
        expect(bundle.snippets.length).toBeGreaterThan(0);
        expect(bundle.snippets[0].text).toContain("AuthService");
    });

    it("saves tokens versus reading the matched files whole", () => {
        const bundle = ContextAssembler.assemble(PROJECT_DIR, "AuthService login");
        expect(bundle.fullFilesTokens).toBeGreaterThan(0);
        expect(bundle.bundleTokens).toBeGreaterThan(0);
        expect(bundle.bundleTokens).toBeLessThan(bundle.fullFilesTokens);
        expect(bundle.savingsPercent).toBeGreaterThan(0);
    });

    it("renders a readable context document", () => {
        const md = formatContextBundle(ContextAssembler.assemble(PROJECT_DIR, "AuthService"));
        expect(md).toContain("Context Bundle");
        expect(md).toContain("AuthService");
        expect(md).toContain("Source snippets");
    });

    it("notes when no symbols match", () => {
        const bundle = ContextAssembler.assemble(PROJECT_DIR, "zzz-nonexistent-symbol-xyz");
        expect(bundle.symbols).toHaveLength(0);
        expect(bundle.notes.join(" ")).toContain("No matching symbols");
    });

    it("achieves >75% token savings on a multi-symbol large module", () => {
        const fillerBody = Array.from(
            { length: 220 },
            (_, i) => `    const step${i} = "unreferenced_internal_computation_${i}_payload_data";`,
        ).join("\n");
        const largeModule = [
            "export class BillingEngine {",
            "  computeLegacyLedger(): string {",
            fillerBody,
            "    return 'legacy';",
            "  }",
            "}",
            "export function calculateInvoiceTax(amountCents: number, rateBps: number): number {",
            "  return Math.round((amountCents * rateBps) / 10000);",
            "}",
        ].join("\n");

        fs.writeFileSync(path.join(PROJECT_DIR, "src", "billing.ts"), largeModule);
        CodeGraph.index(PROJECT_DIR);

        const bundle = ContextAssembler.assemble(PROJECT_DIR, "Fix rounding in calculateInvoiceTax");
        expect(bundle.matchedFiles).toContain(path.join("src", "billing.ts"));
        expect(bundle.savingsPercent).toBeGreaterThanOrEqual(75);
    });
});
