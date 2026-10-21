/**
 * Incremental code graph (files, symbols, imports) for RAG context.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { StorageDiscipline } from "./discipline.js";

export class StorageCodeGraph extends StorageDiscipline {
    public static getCodeFileHash(filePath: string): string | null {
        try {
            const row = this.getDB().prepare("SELECT hash FROM code_files WHERE path = ?").get(filePath) as { hash: string } | undefined;
            return row?.hash ?? null;
        } catch (err) {
            logger.debug(`Failed to get code file hash: ${(err as Error).message}`);
            return null;
        }
    }

    public static upsertCodeFile(filePath: string, hash: string): void {
        this.getDB().prepare(`
            INSERT INTO code_files (path, hash, updated_at) VALUES (?, ?, datetime('now'))
            ON CONFLICT(path) DO UPDATE SET hash = excluded.hash, updated_at = datetime('now')
        `).run(filePath, hash);
    }

    public static replaceCodeSymbols(
        filePath: string,
        symbols: Array<{ name: string; kind: string; startLine: number; endLine: number; signature: string; exported: boolean }>,
    ): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_symbols WHERE file = ?").run(filePath);
            const ins = db.prepare(
                "INSERT INTO code_symbols (file, name, kind, start_line, end_line, signature, exported) VALUES (?, ?, ?, ?, ?, ?, ?)",
            );
            for (const s of symbols) {
                ins.run(filePath, s.name, s.kind, s.startLine, s.endLine, s.signature, s.exported ? 1 : 0);
            }
        });
        tx();
    }

    public static replaceCodeImports(filePath: string, specifiers: string[]): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_imports WHERE file = ?").run(filePath);
            const ins = db.prepare("INSERT INTO code_imports (file, specifier) VALUES (?, ?)");
            for (const s of specifiers) ins.run(filePath, s);
        });
        tx();
    }

    public static deleteCodeFile(filePath: string): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_symbols WHERE file = ?").run(filePath);
            db.prepare("DELETE FROM code_imports WHERE file = ?").run(filePath);
            db.prepare("DELETE FROM code_files WHERE path = ?").run(filePath);
        });
        tx();
    }

    public static getAllCodeFilePaths(): string[] {
        try {
            return (this.getDB().prepare("SELECT path FROM code_files").all() as Array<{ path: string }>).map((r) => r.path);
        } catch (err) {
            logger.debug(`Failed to list code files: ${(err as Error).message}`);
            return [];
        }
    }

    public static searchCodeSymbols(
        query: string,
        limit = 20,
    ): Array<{ file: string; name: string; kind: string; startLine: number; endLine: number; signature: string; exported: boolean }> {
        try {
            const rows = this.getDB()
                .prepare(
                    "SELECT file, name, kind, start_line, end_line, signature, exported FROM code_symbols " +
                        "WHERE name LIKE ? ORDER BY (name = ?) DESC, length(name) ASC LIMIT ?",
                )
                .all(`%${query}%`, query, limit) as Array<{
                file: string;
                name: string;
                kind: string;
                start_line: number;
                end_line: number;
                signature: string;
                exported: number;
            }>;
            return rows.map((r) => ({
                file: r.file,
                name: r.name,
                kind: r.kind,
                startLine: r.start_line,
                endLine: r.end_line,
                signature: r.signature,
                exported: r.exported === 1,
            }));
        } catch (err) {
            logger.debug(`Failed to search code symbols: ${(err as Error).message}`);
            return [];
        }
    }

    public static getCodeGraphStats(): { files: number; symbols: number; imports: number } {
        try {
            const db = this.getDB();
            const files = (db.prepare("SELECT COUNT(*) AS c FROM code_files").get() as { c: number }).c;
            const symbols = (db.prepare("SELECT COUNT(*) AS c FROM code_symbols").get() as { c: number }).c;
            const imports = (db.prepare("SELECT COUNT(*) AS c FROM code_imports").get() as { c: number }).c;
            return { files, symbols, imports };
        } catch (err) {
            logger.debug(`Failed to read code graph stats: ${(err as Error).message}`);
            return { files: 0, symbols: 0, imports: 0 };
        }
    }

    public static clearCodeGraph(): void {
        const db = this.getDB();
        const tx = db.transaction(() => {
            db.prepare("DELETE FROM code_symbols").run();
            db.prepare("DELETE FROM code_imports").run();
            db.prepare("DELETE FROM code_files").run();
        });
        tx();
    }
}
