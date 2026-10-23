import { Storage } from "../../shared/storage.js";
import { MemoryEntry, MemorySearchResult, MemoryCategory } from "./types.js";

/**
 * [MEMORY] Vector Store Implementation
 * Uses SQLite for persistence, native FTS5 for fast full-text indexing,
 * and cosine similarity for dense/sparse semantic retrieval.
 * Zero-Docker, Lightweight, and 100% Local.
 */
export class VectorStore {
    private static TABLE_NAME = "vector_memory";
    private static FTS_TABLE_NAME = "vector_memory_fts";
    private static ftsAvailable = false;

    public static initialize() {
        const db = Storage.getDB();
        db.exec(`
            CREATE TABLE IF NOT EXISTS ${this.TABLE_NAME} (
                id TEXT PRIMARY KEY,
                content TEXT,
                vector BLOB,
                category TEXT,
                metadata TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        try {
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS ${this.FTS_TABLE_NAME} USING fts5(
                    id UNINDEXED,
                    content,
                    category,
                    tokenize = 'porter unicode61'
                )
            `);
            this.ftsAvailable = true;
        } catch {
            this.ftsAvailable = false;
        }
    }

    public static async addEntry(entry: MemoryEntry) {
        const db = Storage.getDB();
        const vectorBuffer = entry.vector ? Buffer.from(new Float32Array(entry.vector).buffer) : null;
        
        db.prepare(`
            INSERT INTO ${this.TABLE_NAME} (id, content, vector, category, metadata)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                content = excluded.content,
                vector = excluded.vector,
                category = excluded.category,
                metadata = excluded.metadata
        `).run(
            entry.id,
            entry.content,
            vectorBuffer,
            entry.metadata.category,
            JSON.stringify(entry.metadata)
        );

        if (this.ftsAvailable) {
            try {
                db.prepare(`DELETE FROM ${this.FTS_TABLE_NAME} WHERE id = ?`).run(entry.id);
                db.prepare(`INSERT INTO ${this.FTS_TABLE_NAME} (id, content, category) VALUES (?, ?, ?)`).run(
                    entry.id,
                    entry.content,
                    entry.metadata.category
                );
            } catch {
                // Ignore FTS sync failures gracefully
            }
        }
    }

    /**
     * Fast full-text indexed search powered by SQLite FTS5.
     */
    public static async searchByText(
        queryText: string,
        limit: number = 5,
        category?: MemoryCategory
    ): Promise<MemorySearchResult[]> {
        if (!this.ftsAvailable) {
            return [];
        }

        const db = Storage.getDB();
        const sanitized = queryText.replace(/[^a-zA-Z0-9_\s]/g, " ").trim();
        if (!sanitized) return [];

        const terms = sanitized.split(/\s+/).filter(Boolean).map(t => `"${t}"*`).join(" OR ");
        if (!terms) return [];

        try {
            let query = `
                SELECT v.id, v.content, v.metadata, fts.rank
                FROM ${this.FTS_TABLE_NAME} fts
                JOIN ${this.TABLE_NAME} v ON v.id = fts.id
                WHERE ${this.FTS_TABLE_NAME} MATCH ?
            `;
            const params: unknown[] = [terms];
            if (category) {
                query += " AND v.category = ?";
                params.push(category);
            }
            query += " ORDER BY fts.rank LIMIT ?";
            params.push(limit);

            const rows = db.prepare(query).all(...params) as Array<{
                id: string;
                content: string;
                metadata: string;
                rank: number;
            }>;

            return rows.map(r => ({
                entry: {
                    id: r.id,
                    content: r.content,
                    metadata: JSON.parse(r.metadata),
                },
                score: Math.max(0.1, 1.0 / (1.0 + Math.abs(r.rank))),
            }));
        } catch {
            return [];
        }
    }

    public static async search(queryVector: number[], limit: number = 5, category?: MemoryCategory): Promise<MemorySearchResult[]> {
        const db = Storage.getDB();
        let query = `SELECT * FROM ${this.TABLE_NAME}`;
        const params: string[] = [];

        if (category) {
            query += " WHERE category = ?";
            params.push(category);
        }

        const rows = db.prepare(query).all(...params) as Array<{
            id: string;
            content: string;
            vector: Buffer;
            metadata: string;
        }>;
        const candidates: Array<{
            row: typeof rows[0];
            score: number;
            vectorBuffer: Buffer;
        }> = [];

        const qLen = queryVector.length;
        for (const row of rows) {
            if (!row.vector) continue;
            const floatCount = row.vector.byteLength / 4;
            if (floatCount !== qLen) continue;

            const entryFloats = new Float32Array(row.vector.buffer, row.vector.byteOffset, floatCount);
            const score = this.cosineSimilarity(queryVector, entryFloats);
            if (Number.isNaN(score)) continue;

            candidates.push({ row, score, vectorBuffer: row.vector });
        }

        candidates.sort((a, b) => b.score - a.score);
        const top = candidates.slice(0, limit);

        return top.map((c) => {
            const entryVector = Array.from(new Float32Array(c.vectorBuffer.buffer, c.vectorBuffer.byteOffset, c.vectorBuffer.byteLength / 4));
            return {
                entry: {
                    id: c.row.id,
                    content: c.row.content,
                    vector: entryVector,
                    metadata: JSON.parse(c.row.metadata),
                },
                score: c.score,
            };
        });
    }

    private static cosineSimilarity(vecA: ArrayLike<number>, vecB: ArrayLike<number>): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        const len = vecA.length;
        for (let i = 0; i < len; i++) {
            const a = vecA[i];
            const b = vecB[i];
            dotProduct += a * b;
            normA += a * a;
            normB += b * b;
        }
        const denominator = Math.sqrt(normA) * Math.sqrt(normB);
        if (denominator === 0) return 0;
        return dotProduct / denominator;
    }
}
