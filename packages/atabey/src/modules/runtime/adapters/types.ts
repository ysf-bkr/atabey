/**
 * ─── AGENT ADAPTER INTERFACE ─────────────────────────────────────────
 *
 * An AgentAdapter turns a single task prompt into real work by driving an
 * external non-interactive runtime (a headless AI CLI, or a local model).
 *
 * Atabey itself does NOT call an LLM API directly — it orchestrates headless
 * CLIs (Claude / Gemini / Codex / Aider / Ollama). This preserves the project
 * identity: "we do not write code, we coordinate."
 */

export interface AgentTurnRequest {
    /** Target agent, e.g. "@backend". */
    agentName: string;
    /** The task / instruction to execute. */
    prompt: string;
    /** Optional role/system context prepended to the prompt. */
    systemPrompt?: string;
    /** Working directory (typically a per-agent git worktree). */
    cwd: string;
    /** Hard wall-clock timeout in ms (default 120000). */
    timeoutMs?: number;
    /** Cap on captured output characters (default 200000). */
    maxOutputChars?: number;
    /** Extra environment variables for the child process. */
    env?: Record<string, string>;
}

export interface AgentTurnResult {
    ok: boolean;
    output: string;
    exitCode: number | null;
    durationMs: number;
    timedOut: boolean;
    adapterId: string;
    error?: string;
}

export interface AgentAdapter {
    readonly id: string;
    /** Whether the underlying CLI/runtime can be resolved on this machine. */
    isAvailable(): Promise<boolean>;
    /** Execute exactly one non-interactive turn and return its output. */
    runTurn(req: AgentTurnRequest): Promise<AgentTurnResult>;
    /** Optional: expose the command + argv so a caller (e.g. the sandbox runtime) can spawn it. */
    buildCommand?(prompt: string): { command: string; args: string[]; useStdin?: boolean };
}
