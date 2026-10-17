import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CircuitBreaker,
    CircuitOpenError,
    computeBackoffDelay,
    isTransientError,
    resetAllCircuitBreakers,
    withResilience,
    withRetry,
} from "../src/resilience.js";

describe("resilience", () => {
    afterEach(() => {
        resetAllCircuitBreakers();
        vi.restoreAllMocks();
    });

    describe("withRetry", () => {
        it("succeeds without retry", async () => {
            const fn = vi.fn(async () => 42);
            await expect(withRetry(fn, { maxAttempts: 3 })).resolves.toBe(42);
            expect(fn).toHaveBeenCalledOnce();
        });

        it("retries with exponential backoff then succeeds", async () => {
            let n = 0;
            const delays: number[] = [];
            const result = await withRetry(
                async () => {
                    n++;
                    if (n < 3) throw new Error("rate limit");
                    return "ok";
                },
                {
                    maxAttempts: 5,
                    baseDelayMs: 10,
                    maxDelayMs: 50,
                    jitter: false,
                    onRetry: (_e, _a, d) => delays.push(d),
                },
            );
            expect(result).toBe("ok");
            expect(n).toBe(3);
            expect(delays.length).toBe(2);
            // attempt 1 fail → delay base*2^0=10; attempt 2 fail → base*2^1=20
            expect(delays[0]).toBe(10);
            expect(delays[1]).toBe(20);
        });

        it("honors retryIf false", async () => {
            const fn = vi.fn(async () => {
                throw new Error("fatal");
            });
            await expect(
                withRetry(fn, {
                    maxAttempts: 5,
                    retryIf: () => false,
                }),
            ).rejects.toThrow("fatal");
            expect(fn).toHaveBeenCalledOnce();
        });
    });

    describe("computeBackoffDelay", () => {
        it("caps at maxDelayMs", () => {
            const d = computeBackoffDelay(10, {
                baseDelayMs: 100,
                maxDelayMs: 250,
                factor: 2,
                jitter: false,
            });
            expect(d).toBe(250);
        });
    });

    describe("CircuitBreaker", () => {
        it("opens after failure threshold and rejects", async () => {
            const cb = new CircuitBreaker({
                name: "t",
                failureThreshold: 2,
                openMs: 10_000,
            });

            await expect(cb.exec(async () => { throw new Error("1"); })).rejects.toThrow("1");
            await expect(cb.exec(async () => { throw new Error("2"); })).rejects.toThrow("2");
            expect(cb.getState()).toBe("open");
            await expect(cb.exec(async () => "x")).rejects.toBeInstanceOf(CircuitOpenError);
        });

        it("half-open then closes after successes", async () => {
            const cb = new CircuitBreaker({
                name: "t2",
                failureThreshold: 1,
                successThreshold: 1,
                openMs: 30,
            });
            await expect(cb.exec(async () => { throw new Error("fail"); })).rejects.toThrow();
            expect(cb.getState()).toBe("open");
            await new Promise((r) => setTimeout(r, 40));
            expect(cb.getState()).toBe("half-open");
            await expect(cb.exec(async () => "ok")).resolves.toBe("ok");
            expect(cb.getState()).toBe("closed");
        });
    });

    describe("withResilience", () => {
        it("does not retry CircuitOpenError by default", async () => {
            const cb = new CircuitBreaker({ name: "r", failureThreshold: 1, openMs: 60_000 });
            await expect(cb.exec(async () => { throw new Error("x"); })).rejects.toThrow("x");
            const fn = vi.fn(async () => "never");
            // OPEN circuit rejects before fn runs; retryIf must not re-attempt
            await expect(
                withResilience(fn, {
                    circuitBreaker: cb,
                    retry: { maxAttempts: 5, baseDelayMs: 1, jitter: false },
                }),
            ).rejects.toBeInstanceOf(CircuitOpenError);
            expect(fn).not.toHaveBeenCalled();
            expect(cb.getState()).toBe("open");
        });
    });

    describe("isTransientError", () => {
        it("detects rate limit and timeout messages", () => {
            expect(isTransientError(new Error("Rate limit exceeded"))).toBe(true);
            expect(isTransientError(new Error("request timeout"))).toBe(true);
            expect(isTransientError(Object.assign(new Error("e"), { status: 429 }))).toBe(true);
            expect(isTransientError(new Error("validation failed"))).toBe(false);
        });
    });
});
