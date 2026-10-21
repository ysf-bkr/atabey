/**
 * [LIFECYCLE] Task Lifecycle State Machine & Inter-Agent Handover
 *
 * Implements strict state transitions:
 * SPEC → PLAN → IMPLEMENT → TEST → REVIEW → MERGE → DONE
 *
 * Enforces:
 * 1. Entry/Exit gates (tests MUST pass before reaching REVIEW/DONE)
 * 2. Maker vs Checker separation (authorAgent cannot approve its own review)
 * 3. Structured JSON handover contract between agents
 */

export type TaskLifecycleState =
    | "SPEC"
    | "PLAN"
    | "IMPLEMENT"
    | "TEST"
    | "REVIEW"
    | "MERGE"
    | "DONE"
    | "BLOCKED";

export interface TransitionContext {
    taskId: string;
    traceId: string;
    currentAgent: string;
    targetAgent?: string;
    testExitCode?: number;
    testsPassed?: boolean;
    coveragePct?: number;
    minCoveragePct?: number;
    astValid?: boolean;
    filesModified?: string[];
    reviewApproved?: boolean;
    authorAgent?: string;
}

export interface TransitionResult {
    allowed: boolean;
    reason?: string;
    from: TaskLifecycleState;
    to: TaskLifecycleState;
}

export const LIFECYCLE_ALLOWED_TRANSITIONS: Record<TaskLifecycleState, TaskLifecycleState[]> = {
    SPEC: ["PLAN", "BLOCKED"],
    PLAN: ["IMPLEMENT", "SPEC", "BLOCKED"],
    IMPLEMENT: ["TEST", "PLAN", "BLOCKED"],
    TEST: ["REVIEW", "IMPLEMENT", "BLOCKED"],
    REVIEW: ["MERGE", "IMPLEMENT", "DONE", "BLOCKED"],
    MERGE: ["DONE", "BLOCKED"],
    DONE: [],
    BLOCKED: ["SPEC", "PLAN", "IMPLEMENT", "TEST", "REVIEW"],
};

/**
 * Validates whether a state transition is legal and satisfies all entry/exit gates.
 */
export function validateLifecycleTransition(
    from: TaskLifecycleState,
    to: TaskLifecycleState,
    ctx: TransitionContext
): TransitionResult {
    const allowedTargets = LIFECYCLE_ALLOWED_TRANSITIONS[from];
    if (!allowedTargets.includes(to)) {
        return {
            allowed: false,
            from,
            to,
            reason: `Illegal state transition from '${from}' to '${to}'. Allowed: [${allowedTargets.join(", ")}]`,
        };
    }

    // Gate 1: IMPLEMENT → TEST requires valid AST / syntax if provided
    if (from === "IMPLEMENT" && to === "TEST") {
        if (ctx.astValid === false) {
            return {
                allowed: false,
                from,
                to,
                reason: "Cannot transition to TEST: source code has syntax or AST compliance violations.",
            };
        }
    }

    // Gate 2: TEST → REVIEW requires automated tests to pass
    if (from === "TEST" && to === "REVIEW") {
        if (ctx.testsPassed === false || (ctx.testExitCode !== undefined && ctx.testExitCode !== 0)) {
            return {
                allowed: false,
                from,
                to,
                reason: `Cannot transition to REVIEW: tests must pass with exit code 0 (received exitCode: ${ctx.testExitCode}).`,
            };
        }
        if (ctx.coveragePct !== undefined && ctx.minCoveragePct !== undefined) {
            if (ctx.coveragePct < ctx.minCoveragePct) {
                return {
                    allowed: false,
                    from,
                    to,
                    reason: `Cannot transition to REVIEW: coverage ${ctx.coveragePct}% is below required ${ctx.minCoveragePct}%.`,
                };
            }
        }
    }

    // Gate 3: REVIEW → MERGE / DONE requires Maker vs Checker separation
    if (from === "REVIEW" && (to === "MERGE" || to === "DONE")) {
        const reviewer = ctx.currentAgent.replace(/^@/, "");
        const author = (ctx.authorAgent || "").replace(/^@/, "");

        if (author && reviewer.toLowerCase() === author.toLowerCase()) {
            return {
                allowed: false,
                from,
                to,
                reason: `Maker-Checker Violation: Author agent '@${author}' cannot approve its own review. Approval must come from @quality, @security, or @manager.`,
            };
        }

        if (ctx.reviewApproved === false) {
            return {
                allowed: false,
                from,
                to,
                reason: "Cannot complete review: reviewer gave an explicit non-approval or blocking findings remain open.",
            };
        }
    }

    return {
        allowed: true,
        from,
        to,
    };
}

// ─── Inter-Agent Handover Schema ─────────────────────────────────────────────

export interface ExecutedTestResult {
    testFile: string;
    passed: boolean;
    durationMs?: number;
}

export interface AgentHandoverPayload {
    traceId: string;
    taskId?: string;
    fromAgent: string;
    toAgent: string;
    lifecycleState: TaskLifecycleState;
    summary: string;
    filesModified: string[];
    testsExecuted: ExecutedTestResult[];
    openIssues: string[];
    recommendedAction: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
}

/**
 * Validates that an inter-agent message payload adheres to the strict handover contract.
 */
export function validateHandoverPayload(payload: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!payload || typeof payload !== "object") {
        return { valid: false, errors: ["Payload must be a non-null object."] };
    }

    const p = payload as Record<string, unknown>;

    if (!p.traceId || typeof p.traceId !== "string") {
        errors.push("Missing or invalid string field: 'traceId'");
    }
    if (!p.fromAgent || typeof p.fromAgent !== "string") {
        errors.push("Missing or invalid string field: 'fromAgent'");
    }
    if (!p.toAgent || typeof p.toAgent !== "string") {
        errors.push("Missing or invalid string field: 'toAgent'");
    }
    if (!p.lifecycleState || typeof p.lifecycleState !== "string") {
        errors.push("Missing or invalid string field: 'lifecycleState'");
    }
    if (!p.summary || typeof p.summary !== "string") {
        errors.push("Missing or invalid string field: 'summary'");
    }
    if (!Array.isArray(p.filesModified)) {
        errors.push("Missing or non-array field: 'filesModified'");
    }
    if (!Array.isArray(p.testsExecuted)) {
        errors.push("Missing or non-array field: 'testsExecuted'");
    }
    if (!Array.isArray(p.openIssues)) {
        errors.push("Missing or non-array field: 'openIssues'");
    }
    if (!p.recommendedAction || typeof p.recommendedAction !== "string") {
        errors.push("Missing or invalid string field: 'recommendedAction'");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
