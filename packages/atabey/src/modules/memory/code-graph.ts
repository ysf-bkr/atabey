import crypto from "crypto";
import fs from "fs";
import path from "path";
import { AtabeyStorage } from "../../shared/storage.js";
import { logger } from "../../shared/logger.js";

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "coverage",
    ".atabey",
    "build",
    ".next",
    "out",
    ".turbo",
]);

export interface CodeSymbol {
    name: string;
    kind: string;
    startLine: number;
    endLine: number;
    signature: string;
    exported: boolean;
}

export interface SymbolHit extends CodeSymbol {
    file: string;
}

export interface IndexResult {
    scanned: number;
    updated: number;
    removed: number;
    files: number;
    symbols: number;
    imports: number;
}

const SYMBOL_PATTERNS: Array<{ kind: string; re: RegExp }> = [
    { kind: "class", re: /^\s*(export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/ },
    { kind: "interface", re: /^\s*(export\s+)?interface\s+([A-Za-z_$][\w$]*)/ },
    { kind: "type", re: /^\s*(export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=/ },
    { kind: "enum", re: /^\s*(export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/ },
    { kind: "function", re: /^\s*(export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/ },
    {
        kind: "function",
        re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/,
    },
    { kind: "function", re: /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/ },
];

const IMPORT_RE =
    /^\s*(?:import|export)\b[\s\S]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']|require\(\s*["']([^"']+)["']\s*\)/;

function findEndLine(lines: string[], startIdx: number): number {
    let depth = 0;
    let seenBrace = false;
    for (let i = startIdx; i < lines.length && i < startIdx + 800; i++) {
        const sanitizedLine = lines[i]
            .replace(/\/\/.*$/, "")
            .replace(/(["'`])(?:(?=(\\?))\2.)*?\1/g, "");
        for (const ch of sanitizedLine) {
            if (ch === "{") {
                depth++;
                seenBrace = true;
            } else if (ch === "}") {
                depth--;
            }
        }
        if (seenBrace && depth <= 0) return i + 1;
        if (!seenBrace && i === startIdx) return i + 1;
    }
    return startIdx + 1;
}

/** AST-lite symbol extraction (functions/classes/interfaces/types/enums). */
export function extractSymbols(content: string, includeNonExported = true): CodeSymbol[] {
    const lines = content.split(/\r?\n/);
    const out: CodeSymbol[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const { kind, re } of SYMBOL_PATTERNS) {
            const m = re.exec(line);
            if (!m) continue;
            const exported = Boolean(m[1]);
            if (!exported && !includeNonExported) continue;
            out.push({
                name: m[2],
                kind,
                startLine: i + 1,
                endLine: findEndLine(lines, i),
                signature: line.trim().slice(0, 120),
                exported,
            });
            break;
        }
    }
    return out;
}

/** Extract module specifiers from import/export-from/require statements. */
export function extractImports(content: string): string[] {
    const specifiers = new Set<string>();
    for (const line of content.split(/\r?\n/)) {
        const m = IMPORT_RE.exec(line);
        if (!m) continue;
        const s = m[1] || m[2] || m[3];
        if (s) specifiers.add(s);
    }
    return [...specifiers];
}

function hashContent(content: string): string {
    return crypto.createHash("sha1").update(content).digest("hex");
}

function walkSourceFiles(root: string, maxFiles: number): { files: string[]; truncated: boolean } {
    const out: string[] = [];
    const stack: string[] = [""];
    let truncated = false;
    while (stack.length > 0) {
        if (out.length >= maxFiles) {
            // More source remained but the scan cap was hit — the caller must
            // NOT treat missing paths as deleted (see index()).
            truncated = true;
            break;
        }
        const rel = stack.pop() as string;
        const abs = rel ? path.join(root, rel) : root;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(abs, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const e of entries) {
            const childRel = rel ? path.join(rel, e.name) : e.name;
            if (e.isDirectory()) {
                if (IGNORE_DIRS.has(e.name)) continue;
                stack.push(childRel);
            } else if (e.isFile() && SOURCE_EXT.has(path.extname(e.name))) {
                if (out.length >= maxFiles) {
                    truncated = true;
                    break;
                }
                out.push(childRel);
            }
        }
    }
    return { files: out, truncated };
}

/**
 * ─── CODE GRAPH ──────────────────────────────────────────────────────
 *
 * Incremental symbol/file/import index stored in SQLite (tables `code_files`,
 * `code_symbols`, `code_imports`). Only files whose content hash changed are
 * re-parsed, so re-indexing a large repo is cheap. This is the substrate for
 * "assemble context without re-scanning the whole codebase" (Faz B).
 */
export class CodeGraph {
    public static index(projectRoot: string, options: { maxFiles?: number } = {}): IndexResult {
        const maxFiles = options.maxFiles ?? 5000;
        const walk = walkSourceFiles(projectRoot, maxFiles);
        const current = walk.files;
        // [FIX] A truncated scan must never delete stored records: unscanned
        // files would look "removed" and valid index entries would be wiped.
        const truncated = walk.truncated;
        if (truncated) {
            logger.warn(`[CODE_GRAPH] Scan cap (${maxFiles} files) reached — removal pass skipped to protect the index. Raise the cap for full repos.`);
        }
        const currentSet = new Set(current);
        const storedSet = new Set(AtabeyStorage.getAllCodeFilePaths());

        let updated = 0;
        for (const rel of current) {
            let content: string;
            try {
                content = fs.readFileSync(path.join(projectRoot, rel), "utf8");
            } catch {
                continue;
            }
            const hash = hashContent(content);
            if (AtabeyStorage.getCodeFileHash(rel) === hash) continue; // unchanged → skip

            AtabeyStorage.replaceCodeSymbols(rel, extractSymbols(content));
            AtabeyStorage.replaceCodeImports(rel, extractImports(content));
            AtabeyStorage.upsertCodeFile(rel, hash);
            updated++;
        }

        let removed = 0;
        if (!truncated) {
            for (const rel of storedSet) {
                if (!currentSet.has(rel)) {
                    AtabeyStorage.deleteCodeFile(rel);
                    removed++;
                }
            }
        }

        const stats = AtabeyStorage.getCodeGraphStats();
        return {
            scanned: current.length,
            updated,
            removed,
            files: stats.files,
            symbols: stats.symbols,
            imports: stats.imports,
        };
    }

    /** Find symbols by (partial) name; exact matches rank first. */
    public static find(query: string, limit = 20): SymbolHit[] {
        return AtabeyStorage.searchCodeSymbols(query, limit);
    }

    public static stats(): { files: number; symbols: number; imports: number } {
        return AtabeyStorage.getCodeGraphStats();
    }

    public static clear(): void {
        AtabeyStorage.clearCodeGraph();
    }
}
