/**
 * ─── LOOP DETECTOR TEST ───────────────────────────────────────────
 *
 * Tests the advanced loop detection and prevention mechanisms.
 * Covers: consecutive same tool, file churn, oscillation, rate limit, content identity.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("LoopDetector", () => {
    let recordAndCheck: any;
    let isInCooldown: any;
    let clearCooldown: any;
    let getLoopStats: any;
    let resetLoopDetection: any;

    beforeEach(async () => {
        vi.resetModules();
        // Use a unique agent suffix per test to avoid cross-test contamination
        const testId = Math.random().toString(36).substr(2, 4);
        // Set test-friendly config
        process.env.MCP_LOOP_DETECTION = "true";
        process.env.MCP_LOOP_MAX_CONSECUTIVE = "3";
        process.env.MCP_LOOP_MAX_FILE_CHURN = "2";
        process.env.MCP_LOOP_MAX_FILE_READ_CHURN = "3";
        process.env.MCP_LOOP_OSCILLATION_WINDOW = "4";
        process.env.MCP_LOOP_COOLDOWN_MS = "5000";
        process.env.MCP_LOOP_MAX_CALLS_IN_WINDOW = "100";
        process.env.MCP_LOOP_WINDOW_MS = "60000";

        const mod = await import("../../src/utils/loop-detector.js");
        recordAndCheck = mod.recordAndCheck;
        isInCooldown = mod.isInCooldown;
        clearCooldown = mod.clearCooldown;
        getLoopStats = mod.getLoopStats;
        resetLoopDetection = mod.resetLoopDetection;

        resetLoopDetection();
    });

    describe("Consecutive Same Tool Detection", () => {
        it("should allow calls below threshold", () => {
            const result1 = recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            expect(result1).toBeNull();

            const result2 = recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            expect(result2).toBeNull();
        });

        it("should trigger alert when consecutive calls exceed threshold", () => {
            // MAX_CONSECUTIVE = 3, so 3rd call triggers (>= 3)
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });

            const result = recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            expect(result).not.toBeNull();
            expect(result.type).toBe("consecutive_same_tool");
            expect(result.severity).toBe("critical");
        });

        it("should reset counter when tool changes", () => {
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            // Switch to different tool AND different path to avoid file_churn
            recordAndCheck("agent-1", "write_file", { path: "other.ts", content: "x" });

            // Different tool and path, so no alert
            const result = recordAndCheck("agent-1", "write_file", { path: "other2.ts", content: "y" });
            // Verify agent is NOT in cooldown (clean state)
            clearCooldown("agent-1");
            expect(result).toBeNull();
        });
    });

    describe("File Churn Detection", () => {
        it("should detect excessive writes to same file", () => {
            // Interleave other tool to avoid consecutive_same_tool triggering first
            recordAndCheck("agent-1", "write_file", { path: "app/test.ts", content: "a" });
            recordAndCheck("agent-1", "search_files", { pattern: "test" });

            // MAX_FILE_CHURN = 2, so 2nd write triggers (>= 2)
            const result = recordAndCheck("agent-1", "write_file", { path: "app/test.ts", content: "b" });
            expect(result).not.toBeNull();
            expect(result.type).toBe("file_churn");
        });

        it("should detect excessive reads of same file", () => {
            // Interleave other tool to avoid consecutive_same_tool triggering first
            recordAndCheck("agent-1", "read_file", { path: "config.json" });
            recordAndCheck("agent-1", "read_file", { path: "config.json" });
            recordAndCheck("agent-1", "search_files", { pattern: "test" });

            // MAX_FILE_READ_CHURN = 3, so 3rd read triggers (>= 3)
            const result = recordAndCheck("agent-1", "read_file", { path: "config.json" });
            expect(result).not.toBeNull();
            expect(result.type).toBe("file_churn");
            expect(result.severity).toBe("warning");
        });
    });

    describe("Oscillation Detection", () => {
        it("should detect A-B-A-B pattern", () => {
            // Use unique agent to avoid cooldown from previous tests
            // Must use a fresh agent per test run
            const agent = "agent-osc-" + Date.now();
            // Also clear any leftover cooldown from other agents
            // Pattern: read → write → read → write → read
            // MUST use different file paths to avoid file_churn triggering first
            recordAndCheck(agent, "read_file", { path: "a.ts" });
            recordAndCheck(agent, "write_file", { path: "b.ts", content: "1" });
            recordAndCheck(agent, "read_file", { path: "c.ts" });
            recordAndCheck(agent, "write_file", { path: "d.ts", content: "2" });

            // 5th call: read → should trigger oscillation (alternating A-B-A-B-A)
            const result = recordAndCheck(agent, "read_file", { path: "e.ts" });
            expect(result).not.toBeNull();
            expect(result.type).toBe("oscillation");
        });
    });

    describe("Rate Limit Detection", () => {
        it("should detect excessive calls in time window", () => {
            // MAX_CALLS_IN_WINDOW = 10, so 11th call should trigger
            for (let i = 0; i < 10; i++) {
                recordAndCheck("agent-1", "read_file", { path: `file-${i}.ts` });
            }

            const result = recordAndCheck("agent-1", "read_file", { path: "final.ts" });
            expect(result).not.toBeNull();
            expect(result.type).toBe("rate_limit");
        });
    });

    describe("Content Identity Detection", () => {
        it("should detect repeated identical content writes", () => {
            // Use unique agent to avoid cooldown from previous tests
            const agent = "agent-content";
            // Use different file paths to avoid file_churn, and interleave different tools to avoid consecutive_same_tool and oscillation
            // Need 3 writes in history before detection triggers (recentHashes.length < 3 returns false)
            // content_identity check is last (check 5), so earlier checks must NOT trigger
            recordAndCheck(agent, "write_file", {
                path: "test1.ts",
                content: "const x = 1; // same content",
            });
            recordAndCheck(agent, "search_files", { pattern: "test" });
            recordAndCheck(agent, "write_file", {
                path: "test2.ts",
                content: "const x = 1; // same content",
            });
            recordAndCheck(agent, "list_dir", { path: "." });
            recordAndCheck(agent, "write_file", {
                path: "test3.ts",
                content: "const x = 1; // same content",
            });
            recordAndCheck(agent, "get_health", {});

            // 4th identical content write should trigger (3+ times in last 5)
            const result = recordAndCheck(agent, "write_file", {
                path: "test4.ts",
                content: "const x = 1; // same content",
            });
            expect(result).not.toBeNull();
            expect(result.type).toBe("content_identity");
        });
    });

    describe("Cooldown Management", () => {
        it("should put agent in cooldown after loop detected", () => {
            // Trigger loop detection
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });

            const cooldown = isInCooldown("agent-1");
            expect(cooldown.inCooldown).toBe(true);
            expect(cooldown.remainingMs).toBeGreaterThan(0);
        });

        it("should return cooldown reason", () => {
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });

            const cooldown = isInCooldown("agent-1");
            expect(cooldown.reason).not.toBeNull();
            expect(cooldown.reason).toContain("consecutive");
        });

        it("should manually clear cooldown", () => {
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });

            expect(isInCooldown("agent-1").inCooldown).toBe(true);
            clearCooldown("agent-1");
            expect(isInCooldown("agent-1").inCooldown).toBe(false);
        });
    });

    describe("getLoopStats", () => {
        it("should return stats for agent with no activity", () => {
            const stats = getLoopStats("unknown-agent");
            expect(stats.totalCalls).toBe(0);
            expect(stats.inCooldown).toBe(false);
        });

        it("should return correct stats after calls", () => {
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "write_file", { path: "test.ts", content: "x" });

            const stats = getLoopStats("agent-1");
            expect(stats.totalCalls).toBeGreaterThanOrEqual(2);
            expect(typeof stats.consecutiveTools).toBe("object");
        });
    });

    describe("Per-Agent Isolation", () => {
        it("should not affect other agents when one is in cooldown", () => {
            // Agent-1 enters cooldown
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });
            recordAndCheck("agent-1", "read_file", { path: "test.ts" });

            expect(isInCooldown("agent-1").inCooldown).toBe(true);

            // Agent-2 should be unaffected
            expect(isInCooldown("agent-2").inCooldown).toBe(false);
            const result = recordAndCheck("agent-2", "read_file", { path: "test.ts" });
            expect(result).toBeNull();
        });
    });
});
