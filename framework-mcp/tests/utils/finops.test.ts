/**
 * ─── FINOPS TEST ──────────────────────────────────────────────────
 *
 * Tests the budget management and FinOps enforcement.
 * Covers: budget tracking, threshold alerts, blocking, state persistence.
 */

import fs from "fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("BudgetManager", () => {
    let BudgetManager: any;
    let budgetManager: any;

    beforeEach(async () => {
        vi.resetModules();

        // Clean up any persisted state from previous tests
        const testDir = "/tmp/atabey-test-finops";
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }

        process.env.ATABEY_FRAMEWORK_DIR = testDir;
        process.env.ATABEY_BUDGET_ENABLED = "true";
        process.env.ATABEY_BUDGET_TEAM = "test-team";
        process.env.ATABEY_BUDGET_MONTHLY = "100";
        process.env.ATABEY_BUDGET_AGENT_MAX = "50";
        process.env.ATABEY_COST_PER_1K_TOKENS = "0.003";

        const mod = await import("../../src/utils/finops.js");
        BudgetManager = mod.BudgetManager;
        BudgetManager.resetInstance();
        budgetManager = BudgetManager.getInstance();
        budgetManager.start();
    });

    afterEach(() => {
        budgetManager.stop();
        delete process.env.ATABEY_FRAMEWORK_DIR;
    });

    describe("Budget State", () => {
        it("should initialize with zero spend", () => {
            const state = budgetManager.getState();
            expect(state.team).toBe("test-team");
            expect(state.monthlySpend).toBe(0);
            expect(state.blocked).toBe(false);
        });

        it("should initialize with period dates", () => {
            const state = budgetManager.getState();
            expect(state.periodStart).toBeDefined();
            expect(state.periodEnd).toBeDefined();
            expect(new Date(state.periodEnd) > new Date(state.periodStart)).toBe(true);
        });
    });

    describe("recordUsage", () => {
        it("should record token usage and calculate cost", () => {
            // 1000 tokens = $0.003 (since COST_PER_1K_TOKENS = 0.003)
            budgetManager.recordUsage("agent-1", 1000);
            const state = budgetManager.getState();
            expect(state.monthlySpend).toBe(0.003);
            expect(state.agentSpend["agent-1"]).toBe(0.003);
        });

        it("should return null for within-budget usage", () => {
            const result = budgetManager.recordUsage("agent-1", 100);
            expect(result).toBeNull();
        });

        it("should allow multiple agents to spend", () => {
            budgetManager.recordUsage("agent-1", 1000);
            budgetManager.recordUsage("agent-2", 2000);
            const state = budgetManager.getState();
            expect(state.agentSpend["agent-1"]).toBe(0.003);
            expect(state.agentSpend["agent-2"]).toBe(0.006);
            expect(state.monthlySpend).toBeCloseTo(0.009, 4);
        });
    });

    describe("Budget Limits", () => {
        it("should block when agent exceeds max budget", () => {
            // Agent max budget = $50, so 50/0.003 * 1000 ≈ 16,666,666 tokens
            const error = budgetManager.recordUsage("agent-1", 17000000);
            expect(error).not.toBeNull();
            expect(error).toContain("exceeded max budget");
        });

        it("should block when team exceeds monthly budget", () => {
            // Monthly budget = $100, so we need ~33,333,334 tokens
            const error = budgetManager.recordUsage("agent-1", 34000000);
            expect(error).not.toBeNull();
            expect(error).toContain("exceeded monthly budget");
        });

        it("should stay blocked after budget exceeded", () => {
            budgetManager.recordUsage("agent-1", 34000000);
            const result = budgetManager.recordUsage("agent-1", 1000);
            expect(result).not.toBeNull();
            expect(result).toContain("Budget exceeded");
        });
    });

    describe("checkBudget", () => {
        it("should return allowed=true for within budget", () => {
            budgetManager.recordUsage("agent-1", 1000);
            const result = budgetManager.checkBudget("agent-1");
            expect(result.allowed).toBe(true);
            expect(result.monthlySpend).toBeGreaterThan(0);
        });

        it("should return blocked=true when budget exceeded", () => {
            budgetManager.recordUsage("agent-1", 34000000);
            const result = budgetManager.checkBudget("agent-1");
            expect(result.blocked).toBe(true);
            expect(result.allowed).toBe(false);
        });

        it("should report usage percentage", () => {
            // Use $50 out of $100 (50%)
            budgetManager.recordUsage("agent-1", 16666667);
            const result = budgetManager.checkBudget("agent-1");
            expect(result.usagePercent).toBeGreaterThan(45);
            expect(result.usagePercent).toBeLessThan(55);
        });
    });

    describe("resetPeriod", () => {
        it("should reset all spend data", () => {
            budgetManager.recordUsage("agent-1", 50000);
            budgetManager.resetPeriod();
            const state = budgetManager.getState();
            expect(state.monthlySpend).toBe(0);
            expect(Object.keys(state.agentSpend).length).toBe(0);
            expect(state.blocked).toBe(false);
        });

        it("should update period dates on reset", () => {
            const managerObj = budgetManager as unknown as { state: { periodStart: string } };
            managerObj.state.periodStart = new Date(2020, 0, 1).toISOString();
            const oldPeriod = budgetManager.getState().periodStart;
            budgetManager.resetPeriod();
            const newPeriod = budgetManager.getState().periodStart;
            expect(newPeriod).not.toEqual(oldPeriod);
        });
    });

    describe("applyPolicy", () => {
        it("should apply block policy from enterprise", () => {
            budgetManager.applyPolicy({
                team: "test-team",
                monthlyBudget: 100,
                agentMaxBudget: 50,
                blocked: true,
                blockReason: "Enterprise policy override",
                updatedAt: new Date().toISOString(),
            });
            const state = budgetManager.getState();
            expect(state.blocked).toBe(true);
            expect(state.blockReason).toContain("Enterprise policy");
        });

        it("should ignore policy for other teams", () => {
            budgetManager.applyPolicy({
                team: "other-team",
                monthlyBudget: 0,
                agentMaxBudget: 0,
                blocked: true,
                blockReason: "Other team blocked",
                updatedAt: new Date().toISOString(),
            });
            const state = budgetManager.getState();
            expect(state.blocked).toBe(false);
        });
    });
});
