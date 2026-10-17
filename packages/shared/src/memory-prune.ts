/**
 * Specialty memory pruning — deduplication + cap + summary.
 *
 * `updateSpecialtyMemory` appends raw markdown lessons forever, which bloats
 * prompts and accumulates contradictions. This pure function deduplicates
 * identical lessons (ignoring the timestamp) and caps the retained count,
 * leaving a summary marker for pruned entries.
 */

export interface PruneResult {
    content: string;
    removed: number;
    kept: number;
}

export interface PruneOptions {
    /** Maximum number of lessons retained (newest kept). Default: 100. */
    maxLessons?: number;
}

const LESSON_PREFIX = /^\s*-\s+\*\*\[/;
const TIMESTAMP = /\[[^\]]*\]/g;

export function pruneSpecialtyMarkdown(content: string, options: PruneOptions = {}): PruneResult {
    const maxLessons = options.maxLessons ?? 100;
    if (!content) return { content: content ?? "", removed: 0, kept: 0 };

    const lines = content.split(/\r?\n/);
    const header: string[] = [];
    const lessons: string[] = [];
    const seen = new Set<string>();
    let removed = 0;

    for (const line of lines) {
        if (LESSON_PREFIX.test(line)) {
            const key = line.replace(TIMESTAMP, "").trim().toLowerCase();
            if (seen.has(key)) {
                removed++;
                continue;
            }
            seen.add(key);
            lessons.push(line);
        } else if (line.trim() === "" && lessons.length > 0) {
            // collapse blank lines between lessons
            continue;
        } else {
            header.push(line);
        }
    }

    let kept = lessons;
    if (lessons.length > maxLessons) {
        const dropped = lessons.length - maxLessons;
        removed += dropped;
        kept = lessons.slice(-maxLessons);
        header.push(`- _[memory-prune] ${dropped} older lesson(s) pruned to control prompt size._`);
    }

    const body = [...header, ...kept].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
    return { content: body ? `${body}\n` : "", removed, kept: kept.length };
}
