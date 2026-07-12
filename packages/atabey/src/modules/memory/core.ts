import crypto from "crypto";
import { TraceID } from "../../shared/types.js";
import { generateEmbedding } from "./embedding.js";
import { MemoryCategory, MemoryEntry, MemorySearchResult } from "./types.js";
import { VectorStore } from "./vector-store.js";

/**
 * [MEMORY] Core Memory Service
 * High-level API for managing project knowledge and embeddings.
 * Uses OpenAI Embedding API when available, falls back to TF-IDF.
 */
export class CoreMemory {
    private static readonly VECTOR_DIM = 384;
    private static readonly STOP_WORDS = new Set([
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
        "been", "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "shall", "can", "need",
    ]);

    public static async init() {
        VectorStore.initialize();
    }

    /**
     * Records a new piece of knowledge into the core memory.
     * Uses OpenAI Embedding API when available, falls back to TF-IDF.
     */
    public static async remember(params: {
        content: string;
        category: MemoryCategory;
        traceId?: TraceID;
        filePath?: string;
        tags?: string[];
        vector?: number[];
    }) {
        const id = crypto.createHash("sha256").update(params.content + (params.filePath || "")).digest("hex");

        // Use provided vector or generate via embedding service
        const vector = params.vector || await generateEmbedding(params.content);

        const entry: MemoryEntry = {
            id,
            content: params.content,
            vector,
            metadata: {
                category: params.category,
                traceId: params.traceId,
                filePath: params.filePath,
                tags: params.tags || [],
                createdAt: new Date().toISOString()
            }
        };

        await VectorStore.addEntry(entry);
        return id;
    }

    /**
     * Searches the memory for relevant knowledge using cosine similarity.
     * Uses OpenAI Embedding API when available for the query vector.
     */
    public static async recall(query: string, options: {
        category?: MemoryCategory;
        limit?: number;
        queryVector?: number[];
    }): Promise<MemorySearchResult[]> {
        const vector = options.queryVector || await generateEmbedding(query);
        return VectorStore.search(vector, options.limit || 5, options.category);
    }

    /**
     * Generates a TF-IDF style embedding vector from text.
     * Kept for backward compatibility and as fallback.
     */
    public static generateEmbedding(text: string): number[] {
        const vector = new Array(this.VECTOR_DIM).fill(0);

        // Tokenize and clean
        const tokens = text
            .toLowerCase()
            .replace(/[^a-z0-9_ ]/g, " ")
            .split(/\s+/)
            .filter(t => t.length > 2 && !this.STOP_WORDS.has(t));

        if (tokens.length === 0) {
            return vector;
        }

        // Calculate term frequency
        const tf = new Map<string, number>();
        for (const token of tokens) {
            tf.set(token, (tf.get(token) || 0) + 1);
        }

        // Map each unique token to vector positions using hash
        for (const [token, freq] of tf) {
            for (let i = 0; i < token.length - 1; i++) {
                const ngram = token.substring(i, i + 2);
                const pos = this.hashToPosition(ngram);
                vector[pos] += freq * (i + 1) / token.length;
            }
        }

        // Normalize to unit vector
        const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        if (magnitude > 0) {
            for (let i = 0; i < this.VECTOR_DIM; i++) {
                vector[i] /= magnitude;
            }
        }

        return vector;
    }

    /**
     * Deterministically maps a string to a position in the vector.
     */
    private static hashToPosition(value: string): number {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash) % this.VECTOR_DIM;
    }
}
