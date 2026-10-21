import fs from "fs";
import path from "path";
import { countTokens } from "atabey-shared/tokenizer.js";
import { AtabeyStorage } from "../../shared/storage.js";

export interface ContextSymbol {
    name: string;
    kind: string;
    file: string;
    startLine: number;
    endLine: number;
    signature: string;
    exported: boolean;
}

export interface ContextSnippet {
    file: string;
    startLine: number;
    endLine: number;
    text: string;
}

export interface ContextBundle {
    task: string;
    keywords: string[];
    symbols: ContextSymbol[];
    snippets: ContextSnippet[];
    matchedFiles: string[];
    /** Total files in the CodeGraph index. */
    indexedFiles: number;
    /** Tokens of the assembled bundle. */
    bundleTokens: number;
    /** Tokens if the matched files were read in full. */
    fullFilesTokens: number;
    /** 1 − bundleTokens/fullFilesTokens, as a percentage. */
    savingsPercent: number;
    notes: string[];
}

export interface AssembleOptions {
    maxSymbols?: number;
    maxSnippetLines?: number;
}

const STOPWORDS = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "add", "make", "new", "use",
    "using", "create", "update", "fix", "bug", "feature", "please", "should", "must", "will",
    "have", "has", "are", "was", "were", "code", "file", "files", "test", "tests", "return",
    "value", "values", "when", "where", "which", "while", "want", "need", "should",
]);

/** Extract likely symbol/file identifiers from a natural-language task. */
export function extractKeywords(task: string): string[] {
    const raw = task.split(/[^A-Za-z0-9_$.]+/).filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (w: string): void => {
        const key = w.toLowerCase().replace(/[^a-z0-9_$]/g, "");
        if (key.length < 3 || STOPWORDS.has(key) || seen.has(key)) return;
        seen.add(key);
        out.push(w);
    };
    for (const token of raw) {
        push(token);
        const parts = token.split(/(?=[A-Z])/).filter((p) => p.length >= 3);
        if (parts.length > 1) for (const p of parts) push(p);
    }
    return out;
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
    const out: Array<[number, number]> = [];
    for (const [s, e] of sorted) {
        const last = out[out.length - 1];
        if (last && s <= last[1] + 3) last[1] = Math.max(last[1], e);
        else out.push([s, e]);
    }
    return out;
}

/** Human-readable rendering handed to the agent. */
export function formatContextBundle(b: ContextBundle): string {
    const lines: string[] = [
        `# Context Bundle`,
        `**Task:** ${b.task}`,
        `**Keywords:** ${b.keywords.join(", ") || "_none_"}`,
        `**Symbols:** ${b.symbols.length} · **Files:** ${b.matchedFiles.length}/${b.indexedFiles} indexed · **~${b.bundleTokens} tokens** (vs ~${b.fullFilesTokens} for full files, −${b.savingsPercent}%)`,
        "",
        "## Relevant symbols",
    ];
    if (b.symbols.length === 0) lines.push("_none_");
    for (const s of b.symbols) {
        lines.push(`- \`${s.name}\` (${s.kind}) — ${s.file}:L${s.startLine}-L${s.endLine}${s.exported ? " [exported]" : ""}`);
    }
    if (b.snippets.length > 0) {
        lines.push("", "## Source snippets");
        for (const sn of b.snippets) {
            lines.push("", `### ${sn.file}:L${sn.startLine}-L${sn.endLine}`, "```", sn.text, "```");
        }
    }
    if (b.notes.length > 0) {
        lines.push("", "## Notes");
        for (const n of b.notes) lines.push(`- ${n}`);
    }
    return lines.join("\n");
}

/**
 * ─── CONTEXT ASSEMBLER ───────────────────────────────────────────────
 *
 * Turns a task description into a small, targeted context bundle by querying
 * the CodeGraph instead of scanning the whole repo. Only the line ranges of
 * the matched symbols are read, so the agent gets what it needs while the
 * rest of the codebase is never loaded into context.
 */
export class ContextAssembler {
    public static assemble(projectRoot: string, task: string, options: AssembleOptions = {}): ContextBundle {
        const maxSymbols = options.maxSymbols ?? 10;
        const maxSnippetLines = options.maxSnippetLines ?? 60;
        const keywords = extractKeywords(task);
        const notes: string[] = [];

        // 1. Collect matching symbols from the code graph.
        const symbols: ContextSymbol[] = [];
        const seen = new Set<string>();
        for (const kw of keywords) {
            const hits = AtabeyStorage.searchCodeSymbols(kw, maxSymbols);
            for (const h of hits) {
                const dedupeKey = `${h.file}:${h.name}`;
                if (seen.has(dedupeKey)) continue;
                seen.add(dedupeKey);
                symbols.push(h);
                if (symbols.length >= maxSymbols) break;
            }
            if (symbols.length >= maxSymbols) break;
        }
        if (symbols.length === 0) {
            notes.push("No matching symbols — keywords did not hit the code graph. Run `atabey index` first.");
        }

        // 2. Read only the matched symbol ranges.
        const matchedFiles = [...new Set(symbols.map((s) => s.file))];
        const snippets: ContextSnippet[] = [];
        let fullFilesTokens = 0;

        for (const file of matchedFiles) {
            let content: string;
            try {
                content = fs.readFileSync(path.join(projectRoot, file), "utf8");
            } catch {
                notes.push(`File on disk missing for indexed symbol: ${file}`);
                continue;
            }
            fullFilesTokens += countTokens(content);
            const lines = content.split(/\r?\n/);
            const ranges = mergeRanges(
                symbols.filter((s) => s.file === file).map((s) => [s.startLine, s.endLine] as [number, number]),
            );
            for (const [start, endRaw] of ranges) {
                const end = Math.max(start, Math.min(endRaw, start + maxSnippetLines - 1, lines.length));
                snippets.push({ file, startLine: start, endLine: end, text: lines.slice(start - 1, end).join("\n") });
            }
        }

        const indexed = AtabeyStorage.getCodeGraphStats().files;
        const bundle: ContextBundle = {
            task,
            keywords,
            symbols,
            snippets,
            matchedFiles,
            indexedFiles: indexed,
            bundleTokens: 0,
            fullFilesTokens,
            savingsPercent: 0,
            notes,
        };
        bundle.bundleTokens = countTokens(formatContextBundle(bundle));
        bundle.savingsPercent =
            fullFilesTokens > 0 ? Math.max(0, Math.round((1 - bundle.bundleTokens / fullFilesTokens) * 100)) : 0;
        return bundle;
    }
}
