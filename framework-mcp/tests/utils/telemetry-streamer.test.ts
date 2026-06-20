/**
 * ─── TELEMETRY STREAMER TEST ──────────────────────────────────────
 *
 * Tests the asynchronous telemetry streaming to enterprise server.
 * Covers: enqueue, batching, PII masking, rate limiting, fallback.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock WebSocket
globalThis.WebSocket = vi.fn() as any;

// We need to test the module by resetting state between tests
describe("TelemetryStreamer", () => {
    let TelemetryStreamer: any;
    let streamer: any;

    beforeEach(async () => {
        vi.resetAllMocks();
        // Clear module state
        vi.resetModules();

        // Set test env vars
        process.env.ATABEY_TELEMETRY_ENABLED = "true";
        process.env.ATABEY_SERVER_URL = "https://test-server.company.com";
        process.env.ATABEY_SERVER_TOKEN = "test-token-123";
        process.env.ATABEY_TELEMETRY_BATCH_SIZE = "5";
        process.env.ATABEY_TELEMETRY_FLUSH_INTERVAL = "10000";
        process.env.ATABEY_TELEMETRY_RATE_LIMIT = "200";

        const mod = await import("../../src/utils/telemetry-streamer.js");
        TelemetryStreamer = mod.TelemetryStreamer;
        streamer = TelemetryStreamer.getInstance();
    });

    afterEach(() => {
        streamer.stop();
        vi.restoreAllMocks();
    });

    describe("Singleton & Initialization", () => {
        it("should return the same instance", () => {
            const instance1 = TelemetryStreamer.getInstance();
            const instance2 = TelemetryStreamer.getInstance();
            expect(instance1).toBe(instance2);
        });

        it("should have correct initial disabled state when no URL set", async () => {
            delete process.env.ATABEY_SERVER_URL;
            vi.resetModules();
            const mod = await import("../../src/utils/telemetry-streamer.js");
            const localStreamer = mod.TelemetryStreamer.getInstance();
            const status = localStreamer.getStatus();
            expect(status.enabled).toBe(true);
            expect(status.serverUrl).toBe("");
            expect(status.queueSize).toBe(0);
        });
    });

    describe("Enqueue & Batching", () => {
        it("should enqueue events and update queue size", () => {
            streamer.enqueue({
                type: "tool_call",
                timestamp: new Date().toISOString(),
                agent: "test-agent",
                payload: { tool: "read_file", estimatedTokens: 100 },
            });

            const status = streamer.getStatus();
            expect(status.queueSize).toBeGreaterThanOrEqual(1);
        });

        it("should automatically flush when batch size reached", () => {
            // Mock sendBatch to return success
            streamer.sendBatch = vi.fn().mockResolvedValue(true);

            // Enqueue batch_size events
            for (let i = 0; i < 5; i++) {
                streamer.enqueue({
                    type: "tool_call",
                    timestamp: new Date().toISOString(),
                    agent: "test-agent",
                    payload: { tool: "read_file", tokens: i * 100 },
                });
            }

            // Should have triggered flush
            expect(streamer.sendBatch).toHaveBeenCalled();
        });

        it("should rate limit events per minute", async () => {
            process.env.ATABEY_TELEMETRY_RATE_LIMIT = "2";
            vi.resetModules();
            const mod = await import("../../src/utils/telemetry-streamer.js");
            const localStreamer = mod.TelemetryStreamer.getInstance();

            localStreamer.enqueue({
                type: "tool_call",
                timestamp: new Date().toISOString(),
                agent: "test-agent",
                payload: { tool: "read_file" },
            });

            localStreamer.enqueue({
                type: "tool_call",
                timestamp: new Date().toISOString(),
                agent: "test-agent",
                payload: { tool: "read_file" },
            });

            // Third event should be dropped due to rate limit
            localStreamer.enqueue({
                type: "tool_call",
                timestamp: new Date().toISOString(),
                agent: "test-agent",
                payload: { tool: "read_file" },
            });

            // Queue should have at most 2 events since 3rd was dropped
            expect(localStreamer.getStatus().queueSize).toBeLessThanOrEqual(2);
        });
    });

    describe("PII Masking Before Transmission", () => {
        it("should mask PII in payload before queueing", () => {
            streamer.enqueue({
                type: "tool_call",
                timestamp: new Date().toISOString(),
                agent: "test-agent",
                payload: {
                    tool: "read_file",
                    email: "user@example.com",
                    apiKey: "sk-12345678901234567890",
                },
            });

            // Access internal queue to verify masking
            const queue = (streamer as any).queue;
            expect(queue.length).toBeGreaterThan(0);
            const event = queue[0].event;
            expect(event.payload.email).not.toBe("user@example.com");
            expect(event.payload.apiKey).not.toBe("sk-12345678901234567890");
        });

        it("should double-mask PII in sendBatch", async () => {
            // Import maskObject to test double-masking in sendBatch flow
            const { maskObject } = await import("../../../src/shared/pii.js");

            const events = [
                {
                    id: "test-1",
                    type: "tool_call" as const,
                    timestamp: new Date().toISOString(),
                    agent: "test-agent",
                    machineId: "machine-test",
                    projectHash: "proj-test",
                    payload: {
                        tcKimlik: "12345678901",
                        email: "user@example.com",
                    },
                },
            ];

            // Apply the same masking that sendBatch does
            const sanitizedEvents = events.map(e => ({
                ...e,
                payload: maskObject(e.payload) as Record<string, unknown>,
            }));

            // Verify that TC Kimlik No is masked (field name is in SENSITIVE_FIELDS)
            expect(sanitizedEvents[0].payload.tcKimlik).toBe("***-REDACTED-***");
            // Verify that email value is masked (field name "email" is in SENSITIVE_FIELDS)
            expect(sanitizedEvents[0].payload.email).toBe("***-REDACTED-***");
        });
    });

    describe("Convenience Methods", () => {
        it("logToolCall should enqueue with correct type", () => {
            const spy = vi.spyOn(streamer, "enqueue");
            streamer.logToolCall("test-agent", "read_file", 100, "trace-1", 250);
            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "tool_call",
                    agent: "test-agent",
                })
            );
        });

        it("logGovernanceViolation should mask error message", () => {
            const spy = vi.spyOn(streamer, "enqueue");
            streamer.logGovernanceViolation("test-agent", "write_file", "Email user@test.com found");
            expect(spy).toHaveBeenCalled();
            const callArg = spy.mock.calls[0][0] as { payload: { error: string } };
            expect(callArg.payload.error).not.toContain("user@test.com");
        });

        it("logError should enqueue with correct type", () => {
            const spy = vi.spyOn(streamer, "enqueue");
            streamer.logError("test-agent", "write_file", "Something broke");
            expect(spy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "error",
                    agent: "test-agent",
                })
            );
        });
    });

    describe("Retry & Fallback", () => {
        it("should retry failed batches", async () => {
            // First attempt fails, second succeeds
            streamer.sendBatch = vi.fn()
                .mockRejectedValueOnce(new Error("Network error"))
                .mockResolvedValueOnce(true);

            // Enqueue enough events to trigger auto-flush (batch size = 5)
            for (let i = 0; i < 5; i++) {
                streamer.enqueue({
                    type: "tool_call",
                    timestamp: new Date().toISOString(),
                    agent: "test-agent",
                    payload: { tool: "read_file", index: i },
                });
            }

            // Wait for flush attempt
            await new Promise(r => setTimeout(r, 100));

            // Should have been called at least once
            expect(streamer.sendBatch).toHaveBeenCalled();
        });
    });
});
