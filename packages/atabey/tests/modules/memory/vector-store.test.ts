import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as memoryUtils from "../../../src/cli/utils/memory.js";
import { VectorStore } from "../../../src/modules/memory/vector-store.js";
import { Storage } from "../../../src/shared/storage.js";

describe("VectorStore", () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-vector-test-"));
        process.env.ATABEY_TEST_DIR = tempDir;
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(path.join(tempDir, "memory"));
        fs.mkdirSync(path.join(tempDir, "memory"), { recursive: true });
        memoryUtils.initDocumentStore(tempDir);
        VectorStore.initialize();
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        Storage.reset();
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it("should add a memory entry and retrieve it via search", async () => {
        const vector = new Array(384).fill(0.1);
        await VectorStore.addEntry({
            id: "test-1",
            content: "This is a test memory about authentication",
            vector,
            metadata: {
                category: "ARCHITECTURE",
                tags: ["auth", "security"],
                createdAt: new Date().toISOString()
            }
        });

        const results = await VectorStore.search(vector, 5);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].entry.id).toBe("test-1");
        expect(results[0].score).toBeGreaterThan(0);
    });

    it("should filter by category when specified", async () => {
        const vector = new Array(384).fill(0.2);
        await VectorStore.addEntry({
            id: "test-2",
            content: "Database schema design",
            vector,
            metadata: {
                category: "ARCHITECTURE",
                tags: ["database"],
                createdAt: new Date().toISOString()
            }
        });

        const archResults = await VectorStore.search(vector, 5, "ARCHITECTURE");
        expect(archResults.length).toBeGreaterThanOrEqual(1);

        const codeResults = await VectorStore.search(vector, 5, "CODE_SNIPPET");
        expect(codeResults.length).toBe(0);
    });

    it("should update existing entry on duplicate id", async () => {
        const vector = new Array(384).fill(0.3);
        await VectorStore.addEntry({
            id: "test-3",
            content: "Original content",
            vector,
            metadata: {
                category: "DECISION",
                tags: [],
                createdAt: new Date().toISOString()
            }
        });

        await VectorStore.addEntry({
            id: "test-3",
            content: "Updated content",
            vector,
            metadata: {
                category: "DECISION",
                tags: ["updated"],
                createdAt: new Date().toISOString()
            }
        });

        const results = await VectorStore.search(vector, 5);
        const entry = results.find(r => r.entry.id === "test-3");
        expect(entry).toBeDefined();
        expect(entry!.entry.content).toBe("Updated content");
    });

    it("should return results sorted by similarity score", async () => {
        const baseVector = new Array(384).fill(0.5);
        const similarVector = new Array(384).fill(0.5);
        similarVector[0] = 0.9; // Slightly different

        await VectorStore.addEntry({
            id: "similar-1",
            content: "Very similar content",
            vector: baseVector,
            metadata: { category: "TASK_HISTORY", tags: [], createdAt: new Date().toISOString() }
        });

        await VectorStore.addEntry({
            id: "similar-2",
            content: "Also similar content",
            vector: similarVector,
            metadata: { category: "TASK_HISTORY", tags: [], createdAt: new Date().toISOString() }
        });

        const results = await VectorStore.search(baseVector, 5);
        expect(results.length).toBe(2);
        // First result should have higher score (more similar)
        expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    });
});
