import fs from "fs";
import { safePath } from "atabey-mcp/utils/security.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { verifyReadPermission } from "atabey-mcp/utils/permissions.js";
import { ToolResult } from "../types.js";

export interface GetSymbolOutlineArgs {
    path: string;
    kind?: "function" | "class" | "interface" | "type" | "enum" | "const";
    includeNonExported?: boolean;
}

interface SymbolEntry {
    name: string;
    kind: string;
    exported: boolean;
    startLine: number;
    endLine: number;
    signature: string;
}

const SYMBOL_PATTERNS: Array<{ kind: string; re: RegExp }> = [
    { kind: "class", re: /^\s*(export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
    { kind: "interface", re: /^\s*(export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
    { kind: "type", re: /^\s*(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
    { kind: "enum", re: /^\s*(export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
    { kind: "function", re: /^\s*(export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
    { kind: "function", re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/ },
    { kind: "function", re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/ },
];

function findEndLine(lines: string[], startIdx: number): number {
    // Same-line/one-line declarations (arrow without braces, type aliases) end on their line.
    let depth = 0;
    let seenBrace = false;
    for (let i = startIdx; i < lines.length && i < startIdx + 400; i++) {
        for (const ch of lines[i]) {
            if (ch === "{") { depth++; seenBrace = true; }
            else if (ch === "}") { depth--; }
        }
        if (seenBrace && depth <= 0) return i + 1;
        if (!seenBrace && i === startIdx) return i + 1; // no block (e.g. type alias)
    }
    return startIdx + 1;
}

/**
 * MCP Tool: get_symbol_outline
 *
 * Returns a compact AST-lite symbol map (functions/classes/…with line ranges)
 * for a source file, so agents can locate a symbol without reading the whole file.
 */
export function handleGetSymbolOutline(projectRoot: string, args: GetSymbolOutlineArgs): ToolResult {
    if (!args.path) {
        return { isError: true, content: [{ type: "text", text: "Missing 'path' argument." }] };
    }
    try {
        const filePath = safePath(projectRoot, args.path);
        verifyReadPermission(projectRoot, args.path);
        if (!fs.existsSync(filePath)) {
            return { isError: true, content: [{ type: "text", text: `File not found: ${args.path}` }] };
        }

        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        const symbols: SymbolEntry[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const { kind, re } of SYMBOL_PATTERNS) {
                const m = re.exec(line);
                if (!m) continue;
                const exported = Boolean(m[1]);
                if (!exported && !args.includeNonExported) continue;
                if (args.kind && args.kind !== kind) continue;
                symbols.push({
                    name: m[2],
                    kind,
                    exported,
                    startLine: i + 1,
                    endLine: findEndLine(lines, i),
                    signature: line.trim().slice(0, 120),
                });
                break; // first matching pattern wins for this line
            }
        }

        if (symbols.length === 0) {
            return { content: [{ type: "text", text: `[SYMBOLS] No symbols found in ${args.path}.` }] };
        }

        const text = [
            `[SYMBOLS] ${args.path} — ${symbols.length} symbol(s):`,
            ...symbols.map((s) => `  ${s.kind.padEnd(9)} ${s.name} (L${s.startLine}-L${s.endLine})${s.exported ? " [exported]" : ""}  ${s.signature}`),
        ].join("\n");
        Metrics.logUsage(projectRoot, "@mcp", `get_symbol_outline: ${args.path}`, Metrics.estimateTokens(text));
        return { content: [{ type: "text", text }] };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: `[SYMBOLS] Error: ${String(e)}` }] };
    }
}
