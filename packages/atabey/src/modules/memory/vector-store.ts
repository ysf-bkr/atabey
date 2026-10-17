import { Storage } from "../../shared/storage.js";
import { MemoryEntry, MemorySearchResult, MemoryCategory } from "./types.js";

/**
 * [MEMORY] Vector Store Implementation
 * Uses SQLite for persistence and JS-based cosine similarity for retrieval.
 * Zero-Docker, Lightweight, and Local.
 */
export class VectorStore {
    private static TABLE_NAME = "vector_memory";

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
                metadata = excluded.metadata
        `).run(
            entry.id,
            entry.content,
            vectorBuffer,
            entry.metadata.category,
            JSON.stringify(entry.metadata)
        );
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
        const results: MemorySearchResult[] = [];

        for (const row of rows) {
            if (!row.vector) continue;

            const entryVector = Array.from(new Float32Array(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength / 4));
            const score = this.cosineSimilarity(queryVector, entryVector);

            results.push({
                entry: {
                    id: row.id,
                    content: row.content,
                    vector: entryVector,
                    metadata: JSON.parse(row.metadata)
                },
                score
            });
        }

        return results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }

    private static cosineSimilarity(vecA: number[], vecB: number[]): number {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
