/**
 * [MEMORY] Embedding Service
 *
 * Real embedding generation with OpenAI API integration.
 * Falls back to TF-IDF if no API key is available.
 *
 * Supported methods:
 * 1. OpenAI Embedding API (text-embedding-3-small) — 1536 dimensions
 * 2. TF-IDF fallback (local method) — 384 dimensions
 */

import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { CoreMemory } from "./core.js";

const EMBEDDING_API = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

/**
 * Reads the API key from environment variable or .env file.
 */
function getApiKey(): string | null {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;

    try {
        const envPath = path.join(process.cwd(), ".env");
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, "utf8");
            const match = content.match(/^OPENAI_API_KEY=(.+)$/m);
            if (match) return match[1].trim();
        }
    } catch {
        // Silently ignore .env read errors
    }
    return null;
}

/**
 * Generates an embedding vector for the given text.
 *
 * Priority:
 * 1. OpenAI API (if API key is available)
 * 2. TF-IDF fallback (local)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const apiKey = getApiKey();

    // Use OpenAI API if available
    if (apiKey) {
        try {
            const response = await fetch(EMBEDDING_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    input: text,
                    model: EMBEDDING_MODEL,
                }),
            });

            if (!response.ok) {
                logger.warn(`OpenAI API error: ${response.status}. Falling back to TF-IDF.`);
                return fallbackEmbedding(text);
            }

            const data = await response.json() as { data: Array<{ embedding: number[] }> };
            if (data?.data?.[0]?.embedding) {
                return data.data[0].embedding;
            }
        } catch (err) {
            logger.warn(`OpenAI API call failed: ${(err as Error).message}. Falling back to TF-IDF.`);
        }
    }

    // Fallback: TF-IDF
    return fallbackEmbedding(text);
}

/**
 * TF-IDF fallback embedding using CoreMemory.generateEmbedding.
 * OpenAI embedding is 1536 dimensions, TF-IDF is 384 dimensions.
 * Pads TF-IDF output to 1536 for compatibility.
 */
function fallbackEmbedding(text: string): number[] {
    const tfidfVector = CoreMemory.generateEmbedding(text); // 384 dimensions
    // Pad 384 → 1536
    const padded = new Array(EMBEDDING_DIM).fill(0);
    for (let i = 0; i < tfidfVector.length; i++) {
        padded[i] = tfidfVector[i];
    }
    return padded;
}

/**
 * Batch embedding generation. Single API call for multiple texts.
 * OpenAI supports batch requests natively.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const apiKey = getApiKey();

    if (apiKey) {
        try {
            const response = await fetch(EMBEDDING_API, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    input: texts,
                    model: EMBEDDING_MODEL,
                }),
            });

            if (response.ok) {
                const data = await response.json() as { data: Array<{ embedding: number[] }> };
                if (data?.data) {
                    return data.data.map(d => d.embedding);
                }
            }
        } catch {
            // fallback
        }
    }

    // Fallback for each text
    return Promise.all(texts.map(t => fallbackEmbedding(t)));
}

/**
 * Checks if a vector is an OpenAI embedding (1536 dimensions)
 * as opposed to TF-IDF (384 dimensions).
 */
export function isOpenAIEmbedding(vector: number[]): boolean {
    return vector.length === EMBEDDING_DIM;
}
