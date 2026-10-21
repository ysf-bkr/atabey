import { z } from "zod";

/**
 * ─── STRUCTURED AGENT HANDOFF CONTRACT (B2) ───────────────────────────
 *
 * Free-text agent-to-agent transitions are unverifiable: the next agent (or
 * the manager) cannot programmatically tell what was done, which files
 * changed, or which tests ran. This contract replaces hand-written prose in
 * Hermes RESPONSE messages with a Zod-validated JSON structure.
 *
 * Producers encode via `encodeHandoffMessage()`; consumers decode via
 * `decodeHandoffMessage()` (returns null for legacy free-text messages, so
 * old messages keep flowing during rollout).
 */

export const HandoffTestRunSchema = z.object({
    command: z.string().min(1),
    passed: z.number().int().min(0),
    failed: z.number().int().min(0),
}).strict();

export const HandoffOpenIssueSchema = z.object({
    description: z.string().min(1),
    severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
}).strict();

export const AgentHandoffSchema = z.object({
    /** Execution trace this handoff belongs to. */
    traceId: z.string().min(1),
    /** Agent producing this handoff (with or without @ prefix). */
    fromAgent: z.string().min(1),
    /** Agent (or @manager) receiving the handoff. */
    toAgent: z.string().min(1),
    /** One-line summary of the delegated task. */
    taskSummary: z.string().min(1),
    /** What was actually performed (prose, but structured field). */
    workPerformed: z.string(),
    /** Files created/modified/deleted by the producing agent. */
    changedFiles: z.array(z.string()),
    /** Test/lint/compile runs executed by the producing agent. */
    testsRun: z.array(HandoffTestRunSchema),
    /** Unresolved problems the next agent must know about. */
    openIssues: z.array(HandoffOpenIssueSchema),
    /** Concrete next steps for the receiving agent. */
    nextSteps: z.array(z.string()),
    /** Outcome classification of the producing agent's turn. */
    status: z.enum(["HANDOFF", "BLOCKED", "NEEDS_REVIEW"]),
    /** ISO-8601 timestamp of the handoff. */
    handoffAt: z.string().min(1),
}).strict();

export type AgentHandoff = z.infer<typeof AgentHandoffSchema>;
export type HandoffTestRun = z.infer<typeof HandoffTestRunSchema>;
export type HandoffOpenIssue = z.infer<typeof HandoffOpenIssueSchema>;

/** Type marker used to distinguish handoff payloads in Hermes messages. */
const HANDOFF_MESSAGE_TYPE = "HANDOFF";

/**
 * Validates an unknown payload against the handoff contract.
 * Returns the typed handoff, or a list of human-readable validation errors.
 */
export function validateAgentHandoff(input: unknown): { ok: true; handoff: AgentHandoff } | { ok: false; errors: string[] } {
    const result = AgentHandoffSchema.safeParse(input);
    if (result.success) return { ok: true, handoff: result.data };
    return {
        ok: false,
        errors: result.error.errors.map((e) => `${e.path.join(".") || "(root)"}: ${e.message}`),
    };
}

/** Builds a handoff with defaults for optional-list fields. */
export function buildAgentHandoff(input: {
    traceId: string;
    fromAgent: string;
    toAgent: string;
    taskSummary: string;
    workPerformed: string;
    changedFiles?: string[];
    testsRun?: HandoffTestRun[];
    openIssues?: HandoffOpenIssue[];
    nextSteps?: string[];
    status?: AgentHandoff["status"];
}): AgentHandoff {
    return {
        traceId: input.traceId,
        fromAgent: input.fromAgent,
        toAgent: input.toAgent,
        taskSummary: input.taskSummary,
        workPerformed: input.workPerformed,
        changedFiles: input.changedFiles ?? [],
        testsRun: input.testsRun ?? [],
        openIssues: input.openIssues ?? [],
        nextSteps: input.nextSteps ?? [],
        status: input.status ?? "HANDOFF",
        handoffAt: new Date().toISOString(),
    };
}

/** Encodes a handoff as a Hermes message content string. */
export function encodeHandoffMessage(handoff: AgentHandoff): string {
    return JSON.stringify({ type: HANDOFF_MESSAGE_TYPE, handoff });
}

/**
 * Decodes a Hermes message content string into a validated handoff.
 * Returns null when the content is not a handoff message (legacy free text,
 * plain JSON without the marker, or a payload that fails validation).
 */
export function decodeHandoffMessage(content: string): AgentHandoff | null {
    try {
        const parsed = JSON.parse(content) as { type?: string; handoff?: unknown };
        if (parsed?.type !== HANDOFF_MESSAGE_TYPE || parsed.handoff === undefined) return null;
        const validated = validateAgentHandoff(parsed.handoff);
        return validated.ok ? validated.handoff : null;
    } catch {
        return null;
    }
}

/** Renders a handoff as human-readable Markdown (status boards, logs). */
export function renderHandoffMarkdown(h: AgentHandoff): string {
    const lines: string[] = [
        `### Handoff ${h.fromAgent} → ${h.toAgent} (${h.status})`,
        `- **Trace:** ${h.traceId}`,
        `- **Task:** ${h.taskSummary}`,
        `- **At:** ${h.handoffAt}`,
        "",
        `**Work performed:** ${h.workPerformed || "—"}`,
    ];
    if (h.changedFiles.length > 0) {
        lines.push("", "**Changed files:**");
        for (const f of h.changedFiles) lines.push(`- \`${f}\``);
    }
    if (h.testsRun.length > 0) {
        lines.push("", "**Verification runs:**");
        for (const t of h.testsRun) {
            lines.push(`- \`${t.command}\` — ${t.passed} passed, ${t.failed} failed`);
        }
    }
    if (h.openIssues.length > 0) {
        lines.push("", "**Open issues:**");
        for (const i of h.openIssues) lines.push(`- [${i.severity}] ${i.description}`);
    }
    if (h.nextSteps.length > 0) {
        lines.push("", "**Next steps:**");
        for (const s of h.nextSteps) lines.push(`- ${s}`);
    }
    return lines.join("\n");
}
