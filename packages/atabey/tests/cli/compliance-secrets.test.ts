import { describe, expect, it } from "vitest";
import { verifyCorporateCompliance } from "../../src/cli/utils/compliance.js";

/**
 * Regression tests for the hardcoded-secret heuristic.
 *
 * A false positive here breaks `atabey check` (and therefore CI) for any project
 * whose sources contain an empty env template such as `"# OPENAI_API_KEY="`,
 * because the old regex allowed a match to span newlines. Real secrets must
 * still be detected.
 */
describe("compliance: hardcoded secret detection", () => {
    it("does not flag an empty env template spanning lines", () => {
        const source = [
            "writeTextFile(p, [",
            '    "# Security",',
            '    "# MCP_AUTH_TOKEN=",',
            '    "# AI Provider Keys (optional)",',
            '    "# OPENAI_API_KEY=",',
            '    "# ANOTHER_SECRET=",',
            '    "# DB_PASSWORD=",',
            '    "",',
            '].join("\\n"));',
        ].join("\n");

        expect(() => verifyCorporateCompliance(source, "src/cli/commands/init/scaffold-ops.ts")).not.toThrow();
    });

    it("still detects a real hardcoded API key on one line", () => {
        expect(() =>
            verifyCorporateCompliance('const k = { OPENAI_API_KEY = "sk-live-abcdef123456" };', "src/config.ts"),
        ).toThrow(/Hardcoded API Key/);
    });

    it("still detects hardcoded secrets and passwords", () => {
        expect(() => verifyCorporateCompliance('SECRET = "super-secret-value"', "src/a.ts")).toThrow(/Hardcoded Secret/);
        expect(() => verifyCorporateCompliance(`PASSWORD = 'hunter2hunter2'`, "src/b.ts")).toThrow(/Hardcoded Password/);
    });

    it("does not flag an empty assignment", () => {
        expect(() => verifyCorporateCompliance('const API_KEY = "";', "src/c.ts")).not.toThrow();
    });

    it("flags an email address outside the allow-listed files", () => {
        expect(() => verifyCorporateCompliance("// contact dev@example.com", "src/d.ts")).toThrow(/Email Address/);
    });

    it("allows email addresses in README, package.json and CONTRIBUTING", () => {
        for (const f of ["README.md", "package.json", "CONTRIBUTING.md"]) {
            expect(() => verifyCorporateCompliance("contact: dev@example.com", f)).not.toThrow();
        }
    });

    it("flags a credit-card-like sequence", () => {
        expect(() => verifyCorporateCompliance('const cc = "4111 1111 1111 1111";', "src/e.ts")).toThrow(/Credit Card/);
    });
});
