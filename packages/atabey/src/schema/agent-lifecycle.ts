/**
 * [SCHEMA] Atabey Agent Lifecycle — single source of truth.
 *
 * The canonical state machine every specialized agent follows during a task:
 *
 *   INIT → READY → PLANNING → EXECUTING → (DELEGATING) → VERIFYING → MERGING → COMPLETED / FAILED
 *
 * Entry/exit criteria are documented per state: VERIFYING requires green tests
 * before COMPLIANT, and MERGING requires an isolated branch/worktree with a
 * signed EvidenceBundle before COMPLETED.
 *
 * This module is the single source of truth for the lifecycle. It is injected
 * into each agent's system prompt (see `buildSystemPrompt` in
 * `modules/agents/definitions.ts`) so the host AI obeys the same deterministic
 * lifecycle that Atabey enforces at the orchestration layer.
 */

export interface AgentLifecycleState {
    /** Human-readable description of what the agent does in this state. */
    description: string;
    /** Allowed transitions for this state: event → next state. */
    transitions: Record<string, string>;
}

export interface AgentLifecycleSchema {
    /** Human-readable lifecycle name. */
    name: string;
    /** The state an agent starts in. */
    initialState: string;
    /** All states keyed by state name. */
    states: Record<string, AgentLifecycleState>;
}

export const AGENT_LIFECYCLE: AgentLifecycleSchema = {
    name: "Atabey Agent Lifecycle",
    initialState: "INIT",
    states: {
        INIT: {
            description: "Agent loaded and parsing initial workspace state.",
            transitions: {
                RESOLVED: "READY",
            },
        },
        READY: {
            description: "Agent is idle and listening for Hermes message cues.",
            transitions: {
                DELEGATED: "PLANNING",
            },
        },
        PLANNING: {
            description: "Agent is creating a strategic task division plan.",
            transitions: {
                PLAN_READY: "EXECUTING",
                ABORTED: "FAILED",
            },
        },
        EXECUTING: {
            description: "Agent is running shell scripts, file tools or code modifications.",
            transitions: {
                DELEGATE_REQUIRED: "DELEGATING",
                RUN_COMPLETE: "VERIFYING",
                CRASHED: "FAILED",
            },
        },
        DELEGATING: {
            description: "Agent is blocked waiting for sub-agent results.",
            transitions: {
                SUBTASK_RETURNED: "EXECUTING",
                SUBTASK_TIMEOUT: "FAILED",
            },
        },
        VERIFYING: {
            description:
                "Agent runs tests, linting, and compliance review on the outputs. " +
                "Exit criteria: test suite green, lint clean, AST compliance passed. " +
                "Tests MUST pass before any completion claim.",
            transitions: {
                COMPLIANT: "MERGING",
                NON_COMPLIANT: "FAILED",
            },
        },
        MERGING: {
            description:
                "Verified changes are integrated (commit / worktree merge / PR). " +
                "Entry criteria: VERIFYING exited COMPLIANT. Exit criteria: changes committed on an " +
                "isolated branch or worktree with a signed EvidenceBundle — never directly on a protected branch.",
            transitions: {
                INTEGRATED: "COMPLETED",
                CONFLICT: "FAILED",
            },
        },
        COMPLETED: {
            description: "Task sequence finalized successfully (verified and integrated).",
            transitions: {
                RESET: "READY",
            },
        },
        FAILED: {
            description: "Validation failed, trace aborted.",
            transitions: {
                RETRY: "READY",
            },
        },
    },
};

/**
 * Renders the lifecycle as a Markdown section injected into every agent prompt.
 * Kept here (next to the data) so the schema and its presentation never drift.
 *
 * NOTE: rendered as a bullet list (not a Markdown table) on purpose — a table
 * separator would emit `---`, which collides with YAML frontmatter delimiters in
 * Cursor `.mdc` / Gemini agent files and with the frontmatter-injection guard.
 */
export function renderAgentLifecycle(): string {
    const lc = AGENT_LIFECYCLE;
    const lines: string[] = [
        "## State Machine Protocol",
        `> Every task MUST follow the deterministic **${lc.name}** lifecycle. Initial state: **${lc.initialState}**. Invalid transitions are forbidden.`,
        "",
        "**States & allowed transitions:**",
    ];
    for (const [state, def] of Object.entries(lc.states)) {
        const transitions = Object.entries(def.transitions)
            .map(([event, next]) => `${event} → ${next}`)
            .join("; ");
        lines.push(`- **${state}** — ${def.description} (${transitions})`);
    }
    return lines.join("\n");
}
