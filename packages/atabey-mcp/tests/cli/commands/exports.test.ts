import { describe, expect, it } from "vitest";

describe("CLI Command Exports", () => {
    it("should export approveCommand", async () => {
        const mod = await import("../../../src/cli/commands/approve.js");
        expect(mod.approveCommand).toBeDefined();
    });

    it("should export complianceCheckCommand", async () => {
        const mod = await import("../../../src/cli/commands/compliance.js");
        expect(mod.complianceCheckCommand).toBeDefined();
    });

    it("should export contract commands", async () => {
        const mod = await import("../../../src/cli/commands/contract.js");
        expect(mod.verifyApiContractCommand).toBeDefined();
        expect(mod.updateApiContractCommand).toBeDefined();
    });

    it("should export dashboardCommand", async () => {
        const mod = await import("../../../src/cli/commands/dashboard.js");
        expect(mod.dashboardCommand).toBeDefined();
    });

    it("should export explorer commands", async () => {
        const mod = await import("../../../src/cli/commands/explorer.js");
        expect(mod.explorerGraphCommand).toBeDefined();
        expect(mod.explorerAuditCommand).toBeDefined();
    });

    it("should export git commands", async () => {
        const mod = await import("../../../src/cli/commands/git.js");
        expect(mod.gitCommitCommand).toBeDefined();
        expect(mod.gitSyncCommand).toBeDefined();
    });

    it("should export knowledge commands", async () => {
        const mod = await import("../../../src/cli/commands/knowledge.js");
        expect(mod.updateKnowledgeBaseCommand).toBeDefined();
        expect(mod.searchKnowledgeBaseCommand).toBeDefined();
    });

    it("should export logAgentActionCommand", async () => {
        const mod = await import("../../../src/cli/commands/log.js");
        expect(mod.logAgentActionCommand).toBeDefined();
    });

    it("should export mcpCommand", async () => {
        const mod = await import("../../../src/cli/commands/mcp.js");
        expect(mod.mcpCommand).toBeDefined();
    });

    it("should export scriptCommand", async () => {
        const mod = await import("../../../src/cli/commands/script.js");
        expect(mod.runScriptCommand).toBeDefined();
    });

    it("should export securityAuditCommand", async () => {
        const mod = await import("../../../src/cli/commands/security.js");
        expect(mod.securityAuditCommand).toBeDefined();
    });

    it("should export statusCommand", async () => {
        const mod = await import("../../../src/cli/commands/status.js");
        expect(mod.statusCommand).toBeDefined();
    });

    it("should export trace commands", async () => {
        const mod = await import("../../../src/cli/commands/trace.js");
        expect(mod.traceNewCommand).toBeDefined();
        expect(mod.traceReplayCommand).toBeDefined();
    });
});
