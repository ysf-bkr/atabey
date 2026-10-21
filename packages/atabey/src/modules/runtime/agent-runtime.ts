import { countTokens } from "atabey-shared/tokenizer.js";
import { emitSpan, newSpanId, newTraceId } from "atabey-shared/otel.js";
import { logger } from "../../shared/logger.js";
import { HeadlessCliAdapter, type AgentAdapter, type AgentTurnResult } from "./adapters/index.js";
import { ensureAgentWorktree } from "./worktree.js";

export interface RunTurnOptions {
    /** Hard wall-clock timeout in ms. */
    timeoutMs?: number;
    /** Advisory output-token cap; exceeding it is reported, not fatal. */
    tokenBudget?: number;
    /** Optional role/system context prepended to the prompt. */
    systemPrompt?: string;
    /** Working directory. Defaults to cwd. */
    cwd?: string;
    /** Extra environment variables for the child process. */
    env?: Record<string, string>;
    /** Explicit CLI id override (else resolved from env/config/default). */
    cliId?: string;
    /** Pre-built adapter (dependency injection — used by tests). */
    adapter?: AgentAdapter;
    /** Run in an isolated git worktree (`.atabey/worktrees/<agent>`). */
    worktree?: boolean;
    /** Route the spawn through the sandbox runtime (fail-closed if required). */
    sandbox?: boolean;
    /** Run the QualityGate on the turn output. */
    qualityGate?: boolean;
    /** Inject a targeted context bundle (CodeGraph + ContextAssembler) into the prompt. */
    context?: boolean;
}

export interface AgentTurnReport extends AgentTurnResult {
    agent: string;
    inputTokens: number;
    outputTokens: number;
    isolation: "worktree" | "main-tree";
    sandbox: string;
    quality?: { passed: boolean; reason: string };
}

function envFlag(key: string): boolean {
    return ["1", "true", "yes", "on"].includes((process.env[key] || "").toLowerCase());
}

/**
 * Resolve which headless CLI backs a given agent.
 *
 * Priority: explicit → ATABEY_AGENT_CLI → ATABEY_CLI_<AGENT> → default "claude".
 */
export function resolveAgentCli(agentName: string, explicit?: string): string {
    if (explicit) return explicit;
    if (process.env.ATABEY_AGENT_CLI) return process.env.ATABEY_AGENT_CLI;
    const perAgent = `ATABEY_CLI_${agentName.replace("@", "").toUpperCase()}`;
    if (process.env[perAgent]) return process.env[perAgent] as string;
    return "claude";
}

/**
 * ─── AGENT RUNTIME ───────────────────────────────────────────────────
 *
 * Drives real, non-interactive work for a single agent by orchestrating a
 * headless AI CLI. Optionally isolates the turn in a git worktree, routes it
 * through the sandbox runtime, and runs the QualityGate + emits an OTel span.
 *
 * Never throws for runtime failures — always returns a report.
 */
export class AgentRuntime {
    public static async runTurn(
        agentName: string,
        prompt: string,
        options: RunTurnOptions = {},
    ): Promise<AgentTurnReport> {
        const started = Date.now();
        const telemetryRoot = options.cwd || process.cwd();
        const traceId = newTraceId();
        const spanId = newSpanId();

        const cliId = options.cliId || (options.adapter ? options.adapter.id : resolveAgentCli(agentName));
        let composed = options.systemPrompt ? `${options.systemPrompt}\n\n${prompt}` : prompt;
        let inputTokens = countTokens(composed);

        const wantWorktree = options.worktree ?? envFlag("ATABEY_AGENT_WORKTREE");
        const wantSandbox = options.sandbox ?? envFlag("ATABEY_AGENT_SANDBOX");
        const wantQuality = options.qualityGate ?? envFlag("ATABEY_AGENT_QUALITY_GATE");

        const report = (
            base: AgentTurnResult,
            extra: Partial<Pick<AgentTurnReport, "isolation" | "sandbox" | "quality">> = {},
        ): AgentTurnReport => ({
            ...base,
            agent: agentName,
            inputTokens,
            outputTokens: countTokens(base.output),
            isolation: extra.isolation ?? "main-tree",
            sandbox: extra.sandbox ?? "off",
            quality: extra.quality,
        });

        const emit = (r: AgentTurnReport): AgentTurnReport => {
            emitSpan(telemetryRoot, {
                name: `agent.turn ${agentName}`,
                traceId,
                spanId,
                startMs: started,
                endMs: Date.now(),
                status: r.ok ? "OK" : "ERROR",
                attributes: {
                    agent: agentName,
                    cli: cliId,
                    isolation: r.isolation,
                    sandbox: r.sandbox,
                    inputTokens: r.inputTokens,
                    outputTokens: r.outputTokens,
                    durationMs: r.durationMs,
                },
            });
            return r;
        };

        const failResult = (error: string): AgentTurnResult => ({
            ok: false,
            output: "",
            exitCode: null,
            durationMs: Date.now() - started,
            timedOut: false,
            adapterId: cliId,
            error,
        });

        // ─── Working directory isolation (worktree) ───────────────────────
        let cwd = options.cwd || process.cwd();
        let isolation: "worktree" | "main-tree" = "main-tree";
        if (wantWorktree) {
            try {
                const wt = ensureAgentWorktree(cwd, agentName, wantSandbox);
                if (wt !== cwd) {
                    cwd = wt;
                    isolation = "worktree";
                }
            } catch (e) {
                return emit(report(failResult(`[WORKTREE] ${(e as Error).message}`), { isolation: "main-tree" }));
            }
        }

        // ─── Targeted context injection (no repo re-scan) ─────────────────
        let effectiveSystem = options.systemPrompt;
        if ((options.context ?? envFlag("ATABEY_AGENT_CONTEXT")) && !effectiveSystem) {
            try {
                const { ContextAssembler, formatContextBundle } = await import("../memory/context-assembler.js");
                const bundle = ContextAssembler.assemble(cwd, prompt, { maxSymbols: 8, maxSnippetLines: 40 });
                if (bundle.symbols.length > 0) {
                    effectiveSystem =
                        "You are working on an existing codebase. Do NOT re-scan the repository; use the targeted context below.\n\n" +
                        formatContextBundle(bundle);
                    composed = `${effectiveSystem}\n\n${prompt}`;
                    inputTokens = countTokens(composed);
                    logger.info(
                        `[RUNTIME] Context injected for ${agentName}: ${bundle.symbols.length} symbols, ~${bundle.bundleTokens} tokens (saved ~${bundle.savingsPercent}%)`,
                    );
                }
            } catch (e) {
                logger.warn(`[RUNTIME] Context assembly skipped: ${(e as Error).message}`);
            }
        }

        // ─── Resolve adapter ──────────────────────────────────────────────
        let adapter: AgentAdapter;
        if (options.adapter) {
            adapter = options.adapter;
        } else {
            try {
                adapter = new HeadlessCliAdapter(cliId);
            } catch (e) {
                return emit(report(failResult(`[RUNTIME] ${(e as Error).message}`), { isolation }));
            }
        }

        if (!(await adapter.isAvailable())) {
            return emit(
                report(failResult(`[RUNTIME] CLI "${cliId}" not found on PATH. Install it or set ATABEY_AGENT_CLI.`), { isolation }),
            );
        }

        logger.info(`[RUNTIME] ${agentName} → ${cliId} (cwd: ${cwd}, isolation: ${isolation}, ~${inputTokens} input tokens)`);

        // ─── Execute (sandboxed when requested) ───────────────────────────
        let result: AgentTurnResult;
        let sandboxLabel = "off";

        if (wantSandbox && typeof adapter.buildCommand === "function") {
            try {
                const { runInSandbox } = await import("atabey-shared/sandbox-runtime.js");
                const { command, args, useStdin } = adapter.buildCommand(composed);
                const t0 = Date.now();
                const r = await runInSandbox({
                    command,
                    args,
                    projectRoot: cwd,
                    timeoutMs: options.timeoutMs,
                    stdin: useStdin ? composed : undefined,
                    env: { ...process.env, PWD: cwd, ...(options.env || {}) },
                });
                sandboxLabel = r.runtime;
                const out = r.stdout.trim();
                result = {
                    ok: r.code === 0,
                    output: out,
                    exitCode: r.code,
                    durationMs: Date.now() - t0,
                    timedOut: false,
                    adapterId: `${cliId}@${r.runtime}`,
                    error: r.code === 0 ? undefined : r.stderr.trim().slice(0, 2000) || `exit ${r.code}`,
                };
            } catch (e) {
                // Fail-closed: sandbox required but unavailable, or spawn error.
                sandboxLabel = "failed";
                return emit(report(failResult(`[SANDBOX] ${(e as Error).message}`), { isolation, sandbox: sandboxLabel }));
            }
        } else {
            if (wantSandbox) sandboxLabel = "unavailable";
            result = await adapter.runTurn({
                agentName,
                prompt,
                systemPrompt: effectiveSystem,
                cwd,
                timeoutMs: options.timeoutMs,
                env: options.env,
            });
        }

        const outputTokens = countTokens(result.output);
        if (options.tokenBudget && outputTokens > options.tokenBudget) {
            logger.warn(`[RUNTIME] ${agentName} output ~${outputTokens} tokens exceeds budget ${options.tokenBudget}.`);
        }

        // ─── QualityGate (P0.5) ───────────────────────────────────────────
        let quality: { passed: boolean; reason: string } | undefined;
        if (wantQuality && result.ok) {
            try {
                const { QualityGate } = await import("../engines/quality-gate.js");
                const q = await QualityGate.check(agentName, result.output, prompt);
                quality = { passed: q.passed, reason: q.reason };
                if (!q.passed) {
                    result = { ...result, ok: false, error: `[QUALITY_GATE] ${q.reason}` };
                }
            } catch (e) {
                logger.warn(`[RUNTIME] QualityGate error for ${agentName}: ${(e as Error).message}`);
            }
        }

        logger.info(
            `[RUNTIME] ${agentName} ${result.ok ? "OK" : "FAIL"} in ${result.durationMs}ms (~${outputTokens} output tokens, sandbox: ${sandboxLabel})`,
        );

        return emit(report(result, { isolation, sandbox: sandboxLabel, quality }));
    }
}
