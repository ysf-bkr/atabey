/**
 * Real AST scanning using the TypeScript Compiler API (no regex heuristics).
 *
 * Detects:
 *   - `any` keyword types (AnyKeyword)
 *   - console.log/error/warn/debug/info property-access calls
 *   - `debugger` statements
 *   - TypeScript suppression directives (ts-ignore / ts-nocheck)
 *
 * Used by the rules engine to replace the fragile `:\s*any\b` regex so that
 * comments/strings containing "any" no longer trigger false positives and
 * type aliases / generic `any` are caught.
 */

import ts from "typescript";

export type AstRuleId = "no-any-types" | "no-console-log" | "no-ts-directives" | "no-debugger";

export interface AstViolation {
    ruleId: AstRuleId;
    line: number;
    column: number;
    text: string;
}

const CONSOLE_METHODS = new Set(["log", "error", "warn", "debug", "info", "trace"]);

export function scanSourceForViolations(filePath: string, content: string): AstViolation[] {
    const scriptKind = /\.tsx$/i.test(filePath)
        ? ts.ScriptKind.TSX
        : /\.jsx$/i.test(filePath)
          ? ts.ScriptKind.JSX
          : /\.js$/i.test(filePath)
            ? ts.ScriptKind.JS
            : ts.ScriptKind.TS;

    let sourceFile: ts.SourceFile;
    try {
        sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKind);
    } catch {
        return [];
    }

    const violations: AstViolation[] = [];
    const at = (node: ts.Node, ruleId: AstRuleId, text: string) => {
        const start = node.getStart(sourceFile);
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(start);
        violations.push({ ruleId, line: line + 1, column: character + 1, text });
    };

    const visit = (node: ts.Node): void => {
        // `any` keyword type
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
            at(node, "no-any-types", "any");
        }
        // console.* calls
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "console") {
            const method = node.name.text;
            if (CONSOLE_METHODS.has(method)) at(node, "no-console-log", `console.${method}`);
        }
        // debugger
        if (node.kind === ts.SyntaxKind.DebuggerStatement) {
            at(node, "no-debugger", "debugger");
        }
        ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    // TypeScript suppression directives (comment-based)
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (/@ts-(ignore|nocheck|expect-error)\b/.test(lines[i])) {
            violations.push({ ruleId: "no-ts-directives", line: i + 1, column: 1, text: lines[i].trim().slice(0, 80) });
        }
    }

    return violations;
}
