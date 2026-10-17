import { describe, expect, it } from "vitest";
import { scanSourceForViolations } from "../../../src/mcp/utils/ast-scan.js";

describe("AST scanner (TypeScript Compiler API)", () => {
    it("detects `any` in type positions including generics", () => {
        const code = [
            "const a: any = 1;",
            "const b: Array<any> = [];",
            "type T = Promise<any>;",
        ].join("\n");
        const ids = scanSourceForViolations("x.ts", code).filter((v) => v.ruleId === "no-any-types");
        expect(ids.length).toBe(3);
    });

    it("does NOT flag the word 'any' inside comments or strings", () => {
        const code = [
            "// this comment mentions any number of things",
            'const s = "any string here";',
        ].join("\n");
        const anyViolations = scanSourceForViolations("x.ts", code).filter((v) => v.ruleId === "no-any-types");
        expect(anyViolations).toHaveLength(0);
    });

    it("detects console.* calls and debugger statements", () => {
        const code = ["console.log('x');", "console.error('y');", "debugger;"].join("\n");
        const v = scanSourceForViolations("x.ts", code);
        expect(v.filter((x) => x.ruleId === "no-console-log")).toHaveLength(2);
        expect(v.filter((x) => x.ruleId === "no-debugger")).toHaveLength(1);
    });

    it("detects @ts-ignore / @ts-nocheck directives", () => {
        const code = ["// @ts-ignore", "const x = 1;", "// @ts-nocheck"].join("\n");
        const v = scanSourceForViolations("x.ts", code);
        expect(v.filter((x) => x.ruleId === "no-ts-directives")).toHaveLength(2);
    });
});
