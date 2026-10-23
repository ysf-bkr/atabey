/**
 * Embedding vector-space helpers.
 *
 * Lives in its own module so `vector-store.ts` can classify vectors without
 * importing `embedding.ts` (which pulls in `core.ts` → `vector-store.ts` and
 * would otherwise create an import cycle).
 */

/** Dimensions produced by the OpenAI `text-embedding-3-small` model. */
export const EMBEDDING_DIM = 1536;

/** Dimensions produced by the local TF-IDF vectorizer. */
const TFIDF_DIM = 384;

export type EmbeddingProvider = "openai" | "tfidf";

/**
 * Checks whether a vector is a real OpenAI embedding.
 *
 * Length alone is not enough: local TF-IDF vectors are zero-padded to 1536 so
 * they fit the same column, which means a padded vector also has 1536 entries.
 * A real OpenAI embedding will not have 1152 consecutive exact zeros in its
 * tail, so the padding is what distinguishes them.
 */
export function isOpenAIEmbedding(vector: ArrayLike<number>): boolean {
    if (vector.length !== EMBEDDING_DIM) return false;
    for (let i = TFIDF_DIM; i < EMBEDDING_DIM; i++) {
        if (vector[i] !== 0) return true;
    }
    return false;
}

/** Classifies a vector when no explicit provider tag is available. */
export function inferProvider(vector: ArrayLike<number>): EmbeddingProvider {
    return isOpenAIEmbedding(vector) ? "openai" : "tfidf";
}
