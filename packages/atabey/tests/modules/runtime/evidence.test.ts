import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    buildEvidenceBundle,
    formatEvidenceBundle,
    verifyEvidenceBundle,
    type EvidenceInput,
} from "../../../src/modules/runtime/evidence.js";
import {
    collectWorktreeChanges,
    detectCollisions,
    ensureAgentWorktree,
    mergeWorktreeChanges,
} from "../../../src/modules/runtime/worktree.js";

function input(over: Partial<EvidenceInput> = {}): EvidenceInput {
    return {
        taskId: "T1",
        agent: "@backend",
        ok: true,
        changedFiles: ["src/a.ts", "src/b.ts"],
        diffStat: "2 files changed",
        tokens: { input: 10, output: 20, total: 30 },
        isolation: "worktree",
        sandbox: "off",
        ...over,
    };
}

describe("EvidenceBundle", () => {
    it("builds a signed, verifiable bundle", () => {
        const b = buildEvidenceBundle(input());
        expect(b.contentHash).toMatch(/^[a-f0-9]{64}$/);
        expect(b.signature).toMatch(/^[a-f0-9]{64}$/);
        expect(verifyEvidenceBundle(b)).toBe(true);
    });

    it("detects post-hoc tampering", () => {
        const b = buildEvidenceBundle(input());
        b.ok = false; // tamper after signing
        expect(verifyEvidenceBundle(b)).toBe(false);
    });

    it("formats a readable report", () => {
        const md = formatEvidenceBundle(buildEvidenceBundle(input()));
        expect(md).toContain("Evidence Bundle");
        expect(md).toContain("@backend");
        expect(md).toContain("src/a.ts");
    });
});

describe("detectCollisions", () => {
    it("finds files touched by more than one agent", () => {
        expect(
            detectCollisions({ "@backend": ["a.ts", "b.ts"], "@frontend": ["b.ts", "c.ts"] }),
        ).toEqual(["b.ts"]);
    });

    it("returns empty when there is no overlap", () => {
        expect(detectCollisions({ "@a": ["x.ts"], "@b": ["y.ts"] })).toEqual([]);
    });
});

describe("collectWorktreeChanges", () => {
    let repo: string;

    beforeEach(() => {
        repo = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-wt-"));
        const git = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: "pipe" });
        git(["init"]);
        git(["config", "user.email", "t@t.t"]);
        git(["config", "user.name", "t"]);
        fs.writeFileSync(path.join(repo, "tracked.ts"), "original");
        git(["add", "."]);
        git(["commit", "-m", "init"]);
    });

    afterEach(() => {
        fs.rmSync(repo, { recursive: true, force: true });
    });

    it("reports modified and untracked files", () => {
        fs.writeFileSync(path.join(repo, "tracked.ts"), "changed");
        fs.writeFileSync(path.join(repo, "new.ts"), "brand new");
        const { files, diffStat } = collectWorktreeChanges(repo);
        expect(files).toContain("tracked.ts");
        expect(files).toContain("new.ts");
        expect(diffStat).toContain("tracked.ts");
    });

    it("returns empty for a non-git path", () => {
        const plain = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-plain-"));
        try {
            expect(collectWorktreeChanges(plain).files).toEqual([]);
        } finally {
            fs.rmSync(plain, { recursive: true, force: true });
        }
    });

    it("applies non-conflicting worktree changes back to projectRoot and blocks on conflict", () => {
        const wtBack = ensureAgentWorktree(repo, "@backend", true);
        const wtFront = ensureAgentWorktree(repo, "@frontend", true);

        fs.writeFileSync(path.join(wtBack, "tracked.ts"), "updated-by-backend");
        fs.writeFileSync(path.join(wtFront, "ui.tsx"), "created-by-frontend");

        const merged = mergeWorktreeChanges(repo, {
            "@backend": ["tracked.ts"],
            "@frontend": ["ui.tsx"],
        });
        expect(merged.merged).toBe(true);
        expect(merged.appliedFiles).toEqual(["tracked.ts", "ui.tsx"]);
        expect(fs.readFileSync(path.join(repo, "tracked.ts"), "utf8")).toBe("updated-by-backend");
        expect(fs.readFileSync(path.join(repo, "ui.tsx"), "utf8")).toBe("created-by-frontend");

        const blocked = mergeWorktreeChanges(repo, {
            "@backend": ["shared.ts"],
            "@frontend": ["shared.ts"],
        });
        expect(blocked.merged).toBe(false);
        expect(blocked.conflicts).toEqual(["shared.ts"]);
    });
});

