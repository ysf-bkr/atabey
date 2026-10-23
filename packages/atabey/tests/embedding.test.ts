import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    generateEmbedding,
    generateEmbeddingWithMeta,
    generateEmbeddings,
    isOpenAIEmbedding,
} from "../src/modules/memory/embedding.js";

describe("Embedding Service", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = { ...originalEnv };
        vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("should correctly identify OpenAI embeddings by dimension", () => {
        const openAIVector = new Array(1536).fill(0.1);
        const tfidfVector = new Array(384).fill(0.1);
        const invalidVector = new Array(100).fill(0.1);

        expect(isOpenAIEmbedding(openAIVector)).toBe(true);
        expect(isOpenAIEmbedding(tfidfVector)).toBe(false);
        expect(isOpenAIEmbedding(invalidVector)).toBe(false);
    });

    it("should fallback to TF-IDF (padded to 1536) when no API key is provided", async () => {
        delete process.env.OPENAI_API_KEY;

        const text = "sample query text";
        const vector = await generateEmbedding(text);

        expect(vector).toBeDefined();
        expect(vector.length).toBe(1536);

        // Padded part (dimensions 384 to 1535) should be all 0
        const paddedPart = vector.slice(384);
        expect(paddedPart.every(val => val === 0)).toBe(true);
    });

    it("should use OpenAI API when API key is set and call succeeds", async () => {
        process.env.OPENAI_API_KEY = "sk-test-key-12345";

        const mockEmbedding = new Array(1536).fill(0.5);
        const mockFetch = vi.mocked(fetch).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                data: [{ embedding: mockEmbedding }]
            })
        } as Response);

        const vector = await generateEmbedding("hello world");

        expect(mockFetch).toHaveBeenCalled();
        expect(vector).toEqual(mockEmbedding);
    });

    it("should fallback to TF-IDF when OpenAI API call fails", async () => {
        process.env.OPENAI_API_KEY = "sk-test-key-12345";

        // Mock API failure
        const mockFetch = vi.mocked(fetch).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ error: "Internal Server Error" })
        } as Response);

        const vector = await generateEmbedding("hello world");

        expect(mockFetch).toHaveBeenCalled();
        expect(vector.length).toBe(1536);
        // Should have fallen back to TF-IDF (first 384 dimensions contain non-zero data, rest are 0)
        const paddedPart = vector.slice(384);
        expect(paddedPart.every(val => val === 0)).toBe(true);
    });

    it("does not classify a zero-padded TF-IDF vector as an OpenAI embedding", async () => {
        delete process.env.OPENAI_API_KEY;
        const vector = await generateEmbedding("some local text");
        expect(vector).toHaveLength(1536);
        expect(isOpenAIEmbedding(vector)).toBe(false);
    });

    it("reports which provider produced the vector", async () => {
        delete process.env.OPENAI_API_KEY;
        const local = await generateEmbeddingWithMeta("local text");
        expect(local.provider).toBe("tfidf");
        expect(isOpenAIEmbedding(local.vector)).toBe(false);

        process.env.OPENAI_API_KEY = "sk-test-key-12345";
        vi.mocked(fetch).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: [{ embedding: new Array(1536).fill(0.5) }] }),
        } as Response);

        const remote = await generateEmbeddingWithMeta("remote text");
        expect(remote.provider).toBe("openai");
        expect(isOpenAIEmbedding(remote.vector)).toBe(true);
    });

    it("reports the tfidf provider when OpenAI fails mid-request", async () => {
        process.env.OPENAI_API_KEY = "sk-test-key-12345";
        vi.mocked(fetch).mockRejectedValue(new Error("network down"));

        const result = await generateEmbeddingWithMeta("fallback text");
        expect(result.provider).toBe("tfidf");
        expect(isOpenAIEmbedding(result.vector)).toBe(false);
    });

    it("should support batch embedding generation", async () => {
        process.env.OPENAI_API_KEY = "sk-test-key-12345";

        const mockEmbeddings = [
            new Array(1536).fill(0.1),
            new Array(1536).fill(0.2)
        ];

        const mockFetch = vi.mocked(fetch).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                data: [
                    { embedding: mockEmbeddings[0] },
                    { embedding: mockEmbeddings[1] }
                ]
            })
        } as Response);

        const vectors = await generateEmbeddings(["doc1", "doc2"]);

        expect(mockFetch).toHaveBeenCalled();
        expect(vectors).toEqual(mockEmbeddings);
    });
});
