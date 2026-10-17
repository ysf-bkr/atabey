import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FinOpsManager } from "../../../src/mcp/utils/finops.js";
import { Storage } from "../../../src/shared/storage.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-finops-" + Date.now());

beforeAll(() => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    fs.mkdirSync(TEST_DIR, { recursive: true });
    Storage.reset();
    Storage.updateAgentStatus("backend", "READY", "idle");
});

afterAll(() => {
    Storage.reset();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("FinOpsManager budget config", () => {
    it("sets and reads per-agent budgets", () => {
        FinOpsManager.setAgentBudget("@backend", 12.5);
        expect(FinOpsManager.getAgentBudgets().backend).toBe(12.5);
        const check = FinOpsManager.checkAgentBudget("@backend");
        expect(check.agentMaxBudget).toBe(12.5);
    });

    it("sets the monthly budget", () => {
        FinOpsManager.setMonthlyBudget(200);
        expect(FinOpsManager.getBudgetState().monthlyBudget).toBe(200);
    });

    it("sets and clears the webhook url", () => {
        FinOpsManager.setWebhookUrl("https://example.com/hook");
        expect(FinOpsManager.getWebhookUrl()).toBe("https://example.com/hook");
        FinOpsManager.setWebhookUrl(null);
        expect(FinOpsManager.getWebhookUrl()).toBeNull();
    });

    it("fires threshold alerts once per month (no webhook configured)", async () => {
        const prev = process.env.ATABEY_BUDGET_WEBHOOK;
        delete process.env.ATABEY_BUDGET_WEBHOOK;
        try {
            FinOpsManager.setWebhookUrl(null);
            FinOpsManager.setMonthlyBudget(0.0001);
            FinOpsManager.recordUsage({ agent: "@backend", tokens: 1000 });

            const fired = await FinOpsManager.checkAndNotifyBudgets();
            expect(fired).toContain(50);
            expect(fired).toContain(100);

            // Second call must not re-fire (already recorded for this month).
            const again = await FinOpsManager.checkAndNotifyBudgets();
            expect(again).toHaveLength(0);
        } finally {
            if (prev === undefined) delete process.env.ATABEY_BUDGET_WEBHOOK;
            else process.env.ATABEY_BUDGET_WEBHOOK = prev;
        }
    });
});
