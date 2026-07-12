/**
 * Polly-style resilience primitives — no external deps.
 *
 * - withRetry: exponential backoff + jitter for transient failures
 * - CircuitBreaker: closed → open → half-open state machine
 * - withResilience: compose retry + circuit breaker
 *
 * Typical use: LLM provider rate limits, timeouts, 5xx, network blips.
 */

export type CircuitState = "closed" | "open" | "half-open";

export interface RetryOptions {
    /** Max attempts including the first try. Default: 3 */
    maxAttempts?: number;
    /** Initial delay in ms. Default: 100 */
    baseDelayMs?: number;
    /** Cap on delay in ms. Default: 10_000 */
    maxDelayMs?: number;
    /** Exponential factor. Default: 2 */
    factor?: number;
    /** Add random jitter [0, delay). Default: true */
    jitter?: boolean;
    /** Return true to retry this error. Default: retry all */
    retryIf?: (error: unknown, attempt: number) => boolean;
    /** Optional hook before each sleep */
    onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
    /** Optional abort signal */
    signal?: AbortSignal;
}

export interface CircuitBreakerOptions {
    /** Failures in closed state before opening. Default: 5 */
    failureThreshold?: number;
    /** Successes in half-open before closing. Default: 2 */
    successThreshold?: number;
    /** Time to wait in open before half-open probe. Default: 30_000 */
    openMs?: number;
    /** Optional name for error messages */
    name?: string;
}

export class CircuitOpenError extends Error {
    public readonly circuit: string;
    public readonly retryAfterMs: number;

    constructor(circuit: string, retryAfterMs: number) {
        super(
            `[CircuitBreaker:${circuit}] Circuit is OPEN — rejecting call. Retry after ~${retryAfterMs}ms`,
        );
        this.name = "CircuitOpenError";
        this.circuit = circuit;
        this.retryAfterMs = retryAfterMs;
    }
}

export class CircuitBreaker {
    private state: CircuitState = "closed";
    private failures = 0;
    private successes = 0;
    private openedAt = 0;
    private readonly failureThreshold: number;
    private readonly successThreshold: number;
    private readonly openMs: number;
    private readonly name: string;

    constructor(options: CircuitBreakerOptions = {}) {
        this.failureThreshold = options.failureThreshold ?? 5;
        this.successThreshold = options.successThreshold ?? 2;
        this.openMs = options.openMs ?? 30_000;
        this.name = options.name ?? "default";
    }

    public getState(): CircuitState {
        this.maybeTransitionToHalfOpen();
        return this.state;
    }

    public getStats(): {
        state: CircuitState;
        failures: number;
        successes: number;
        name: string;
    } {
        return {
            state: this.getState(),
            failures: this.failures,
            successes: this.successes,
            name: this.name,
        };
    }

    /** Manual reset (e.g. after operator intervention). */
    public reset(): void {
        this.state = "closed";
        this.failures = 0;
        this.successes = 0;
        this.openedAt = 0;
    }

    public async exec<T>(fn: () => Promise<T>): Promise<T> {
        this.maybeTransitionToHalfOpen();

        if (this.state === "open") {
            const retryAfterMs = Math.max(0, this.openMs - (Date.now() - this.openedAt));
            throw new CircuitOpenError(this.name, retryAfterMs);
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (err) {
            this.onFailure();
            throw err;
        }
    }

    private maybeTransitionToHalfOpen(): void {
        if (this.state === "open" && Date.now() - this.openedAt >= this.openMs) {
            this.state = "half-open";
            this.successes = 0;
        }
    }

    private onSuccess(): void {
        if (this.state === "half-open") {
            this.successes++;
            if (this.successes >= this.successThreshold) {
                this.state = "closed";
                this.failures = 0;
                this.successes = 0;
            }
            return;
        }
        // closed: decay failure count on success
        this.failures = 0;
    }

    private onFailure(): void {
        this.failures++;
        this.successes = 0;
        if (this.state === "half-open") {
            this.trip();
            return;
        }
        if (this.failures >= this.failureThreshold) {
            this.trip();
        }
    }

    private trip(): void {
        this.state = "open";
        this.openedAt = Date.now();
    }
}

export function computeBackoffDelay(
    attempt: number,
    options: Pick<RetryOptions, "baseDelayMs" | "maxDelayMs" | "factor" | "jitter"> = {},
): number {
    const base = options.baseDelayMs ?? 100;
    const max = options.maxDelayMs ?? 10_000;
    const factor = options.factor ?? 2;
    const jitter = options.jitter !== false;

    // attempt is 1-based for first retry after failure → attempt 1 => base * factor^0
    const exp = Math.max(0, attempt - 1);
    let delay = Math.min(max, base * Math.pow(factor, exp));
    if (jitter) {
        delay = Math.floor(Math.random() * delay);
    }
    return delay;
}

export async function withRetry<T>(
    fn: (attempt: number) => Promise<T>,
    options: RetryOptions = {},
): Promise<T> {
    const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    const retryIf = options.retryIf ?? (() => true);

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (options.signal?.aborted) {
            throw options.signal.reason ?? new Error("Aborted");
        }
        try {
            return await fn(attempt);
        } catch (err) {
            lastError = err;
            const isLast = attempt >= maxAttempts;
            if (isLast || !retryIf(err, attempt)) {
                throw err;
            }
            const delay = computeBackoffDelay(attempt, options);
            options.onRetry?.(err, attempt, delay);
            await sleep(delay, options.signal);
        }
    }
    throw lastError;
}

export interface ResilienceOptions {
    retry?: RetryOptions;
    circuitBreaker?: CircuitBreaker;
    /** If true, CircuitOpenError is not retried (default true). */
    skipRetryOnOpenCircuit?: boolean;
}

/**
 * Execute `fn` through optional circuit breaker + retry with exponential backoff.
 */
export async function withResilience<T>(
    fn: (attempt: number) => Promise<T>,
    options: ResilienceOptions = {},
): Promise<T> {
    const breaker = options.circuitBreaker;
    const skipOpen = options.skipRetryOnOpenCircuit !== false;

    const retryOpts: RetryOptions = {
        ...options.retry,
        retryIf: (err, attempt) => {
            if (skipOpen && err instanceof CircuitOpenError) return false;
            return options.retry?.retryIf ? options.retry.retryIf(err, attempt) : true;
        },
    };

    return withRetry(async (attempt) => {
        if (breaker) {
            return breaker.exec(() => fn(attempt));
        }
        return fn(attempt);
    }, retryOpts);
}

/** Heuristic: retry rate limits, timeouts, and common transient network errors. */
export function isTransientError(error: unknown): boolean {
    if (error instanceof CircuitOpenError) return false;
    if (!error) return false;

    const msg = error instanceof Error ? error.message : String(error);
    const lower = msg.toLowerCase();
    const code = (error as { code?: string }).code;
    const status = (error as { status?: number }).status;

    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
    if (code === "ETIMEDOUT" || code === "ECONNRESET" || code === "EAI_AGAIN" || code === "ENOTFOUND") {
        return true;
    }
    if (
        lower.includes("rate limit") ||
        lower.includes("too many requests") ||
        lower.includes("timeout") ||
        lower.includes("temporar") ||
        lower.includes("econnreset") ||
        lower.includes("socket hang up")
    ) {
        return true;
    }
    return false;
}

/** Shared breakers for common services (lazy). */
const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let b = breakers.get(name);
    if (!b) {
        b = new CircuitBreaker({ name, ...options });
        breakers.set(name, b);
    }
    return b;
}

export function resetAllCircuitBreakers(): void {
    for (const b of breakers.values()) b.reset();
    breakers.clear();
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new Error("Aborted"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason ?? new Error("Aborted"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}
