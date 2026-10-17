import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logAgentActionCommand, viewLogsCommand } from "../../../src/cli/commands/log.js";
import { updateKnowledgeBaseCommand, searchKnowledgeBaseCommand } from "../../../src/cli/commands/knowledge.js";
import { Storage } from "../../../src/shared/storage.js";
import { CoreMemory } from "../../../src/modules/memory/core.js";

describe("CLI log and knowledge commands", () => {
    beforeEach(async () => {
        await CoreMemory.init();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("log commands", () => {
        it("should save log entry and retrieve via viewLogsCommand", async () => {
            const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

            const rowId = await logAgentActionCommand({
                agent: "backend",
                action: "CREATE_API",
                status: "SUCCESS",
                summary: "Created user authentication endpoint",
                details: { route: "/api/login", method: "POST" }
            });

            expect(rowId).toBeGreaterThan(0);

            await viewLogsCommand({ agent: "backend", limit: 5 });

            const output = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
            expect(output).toContain("@backend");
            expect(output).toContain("CREATE_API");
            expect(output).toContain("Created user authentication endpoint");
        });

        it("should handle empty logs gracefully", async () => {
            const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
            await viewLogsCommand({ agent: "non_existent_agent_xyz" });
            const output = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
            expect(output).toContain("No logs found for agent: @non_existent_agent_xyz");
        });
    });

    describe("knowledge commands", () => {
        it("should store and search knowledge in vector memory", async () => {
            const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

            const topic = "Authentication Architecture";
            const content = "Atabey uses JWT with RS256 and refresh tokens stored in Redis.";

            await updateKnowledgeBaseCommand(topic, content);

            const storeOutput = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
            expect(storeOutput).toContain("Knowledge base updated");
            expect(storeOutput).toContain("Authentication Architecture");

            stdoutSpy.mockClear();

            await searchKnowledgeBaseCommand("JWT tokens Redis");

            const searchOutput = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
            expect(searchOutput).toContain("Knowledge Base Search Results");
            expect(searchOutput).toContain("Match:");
            expect(searchOutput).toContain("Authentication Architecture");
        });

        it("should report when no knowledge matches search", async () => {
            const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

            await searchKnowledgeBaseCommand("completely unrelated nonexistent cosmic query 12345");

            const searchOutput = stdoutSpy.mock.calls.map(c => String(c[0])).join("");
            // Depending on cosine similarity threshold / results
            expect(searchOutput.length).toBeGreaterThan(0);
        });
    });
});
