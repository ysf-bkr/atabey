import { describe, expect, it } from "vitest";
import { pruneSpecialtyMarkdown } from "../src/memory-prune.js";

describe("specialty memory pruning", () => {
    it("deduplicates identical lessons (ignoring timestamps)", () => {
        const input = [
            "# Learned Conventions for @backend",
            "",
            "- **[2026-01-01]**: Always validate input.",
            "- **[2026-02-01]**: Always validate input.",
            "- **[2026-03-01]**: Use zod schemas.",
        ].join("\n");
        const res = pruneSpecialtyMarkdown(input);
        expect(res.removed).toBe(1);
        expect(res.kept).toBe(2);
        expect(res.content.match(/Always validate input/g)?.length).toBe(1);
    });

    it("caps the number of retained lessons (keeps newest)", () => {
        const lines = ["# Header"];
        for (let i = 0; i < 50; i++) lines.push(`- **[2026-01-01]**: lesson ${i}`);
        const res = pruneSpecialtyMarkdown(lines.join("\n"), { maxLessons: 10 });
        expect(res.kept).toBe(10);
        expect(res.content).toContain("lesson 49");
        expect(res.content).not.toContain("lesson 0\n");
        expect(res.content).toContain("memory-prune");
    });

    it("preserves the header block", () => {
        const res = pruneSpecialtyMarkdown("# Title\n\n- **[x]**: one");
        expect(res.content.startsWith("# Title")).toBe(true);
    });
});
