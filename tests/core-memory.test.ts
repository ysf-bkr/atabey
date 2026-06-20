import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CoreMemory } from "../src/modules/memory/core.js";
import { Storage } from "../src/shared/storage.js";

describe("CoreMemory", () => {
    let testDbDir: string;

    beforeAll(async () => {
        // Use a temporary test database
        testDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-core-memory-test-"));
        process.env.ATABEY_TEST_DIR = testDbDir;

        await CoreMemory.init();
    });

    afterAll(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        try {
            fs.rmSync(testDbDir, { recursive: true, force: true });
        } catch { /* ignore */ }
    });

    it("should store and recall information", async () => {
        const content = "The project uses Vitest for testing and TypeScript for coding.";
        const id = await CoreMemory.remember({
            content,
            category: "ARCHITECTURE",
            tags: ["test", "ts"]
        });

        expect(id).toBeDefined();

        const results = await CoreMemory.recall("How is testing handled?", {
            category: "ARCHITECTURE",
            limit: 1
        });

        expect(results.length).toBe(1);
        expect(results[0].entry.content).toBe(content);
        // TF-IDF embedding produces positive similarity for relevant content
        expect(results[0].score).toBeGreaterThan(0);
        expect(results[0].score).toBeLessThanOrEqual(1);
    });

    it("should filter by category", async () => {
        await CoreMemory.remember({
            content: "Rule 1: No any type.",
            category: "RULE"
        });

        const results = await CoreMemory.recall("any type", {
            category: "ARCHITECTURE" // Searching in wrong category
        });

        expect(results.length).toBe(1);
        expect(results[0].entry.metadata.category).toBe("ARCHITECTURE");
        expect(results[0].entry.content).not.toContain("Rule 1");
    });

    it("should generate consistent embedding for similar texts", async () => {
        const text1 = "backend API endpoint for user authentication";
        const text2 = "user login API authentication service";
        const text3 = "frontend button color and styling";

        const vec1 = CoreMemory.generateEmbedding(text1);
        const vec2 = CoreMemory.generateEmbedding(text2);
        const vec3 = CoreMemory.generateEmbedding(text3);

        // Similar texts should have higher cosine similarity than dissimilar ones
        const sim12 = cosineSimilarity(vec1, vec2);
        const sim13 = cosineSimilarity(vec1, vec3);

        expect(sim12).toBeGreaterThan(sim13);
        expect(vec1.length).toBe(384);
    });
});

function cosineSimilarity(vecA: number[], vecB: number[]): number {
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
