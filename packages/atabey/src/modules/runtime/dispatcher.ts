import os from "os";
import { logger } from "../../shared/logger.js";
import { PlanningEngine } from "../engines/planning-engine.js";
import type { Plan, PlanTask } from "../engines/types.js";
import { AgentRuntime, type AgentTurnReport, type RunTurnOptions } from "./agent-runtime.js";
import { buildEvidenceBundle, type EvidenceBundle } from "./evidence.js";
import {
    collectWorktreeChanges,
    detectCollisions,
    mergeWorktreeChanges,
    resolveAgentWorktreePath,
} from "./worktree.js";

export interface DispatchOptions {
    /** Base working directory for turns (default: cwd). */
    projectRoot?: string;
    /** Global concurrency cap (default: min(cpus, 8)). */
    maxConcurrency?: number;
    /** Isolate each agent in its own git worktree (default: true). */
    worktree?: boolean;
    /** Route turns through the sandbox runtime. */
    sandbox?: boolean;
    /** Run the QualityGate on each turn. */
    qualityGate?: boolean;
    /** Inject a targeted context bundle into each turn's prompt. */
    context?: boolean;
    /** Advisory per-agent token ceiling; tasks beyond it are skipped. */
    perAgentTokenBudget?: number;
    /** Max retries on transient crash/timeout before marking task failed (default: 0). */
    maxRetries?: number;
    /** Fallback agent name or per-agent fallback map if primary worker fails. */
    fallbackAgent?: string | Record<string, string>;
    /** Collect signed evidence bundles + collision check after execution (default: true). */
    collectEvidence?: boolean;
    /** Automatically apply non-conflicting worktree changes back to `projectRoot` when `ok` and zero collisions. */
    mergeChanges?: boolean;
    /** Injectable runner (tests). Defaults to `AgentRuntime.runTurn`. */
    runner?: (agent: string, task: string, opts: RunTurnOptions) => Promise<AgentTurnReport>;
}

export interface TaskResult {
    id: string;
    agent: string;
    ok: boolean;
    skipped: boolean;
    output: string;
    error?: string;
    durationMs: number;
    tokens: number;
    inputTokens: number;
    outputTokens: number;
}

export interface DispatchReport {
    planId: string;
    ok: boolean;
    results: TaskResult[];
    /** Execution waves (task ids) — for observability / the run graph. */
    waves: string[][];
    totalTokens: number;
    /** Files touched by more than one agent (must be resolved before merge). */
    conflicts: string[];
    /** Files applied back to `projectRoot` when `mergeChanges` is enabled and zero conflicts exist. */
    mergedFiles: string[];
    /** Signed proof-of-work per executed task. */
    evidence: EvidenceBundle[];
    errors: string[];
}

/** Minimal counting semaphore (no external deps). */
class Semaphore {
    private available: number;
    private readonly waiters: Array<() => void> = [];

    constructor(limit: number) {
        this.available = Math.max(1, limit);
    }

    public async acquire(): Promise<void> {
        if (this.available > 0) {
            this.available--;
            return;
        }
        await new Promise<void>((resolve) => this.waiters.push(resolve));
    }

    public release(): void {
        const next = this.waiters.shift();
        if (next) next();
        else this.available++;
    }
}

/** Kahn-style level decomposition. Detects cycles / unresolved deps. */
export function computeWaves(tasks: PlanTask[]): { waves: PlanTask[][]; errors: string[] } {
    const remaining = new Map(tasks.map((t) => [t.id as string, t]));
    const done = new Set<string>();
    const waves: PlanTask[][] = [];

    while (remaining.size > 0) {
        const ready = [...remaining.values()].filter((t) => t.dependencies.every((d) => done.has(d as string)));
        if (ready.length === 0) {
            return { waves, errors: ["Circular dependency or unresolved dependencies detected."] };
        }
        waves.push(ready);
        for (const t of ready) {
            remaining.delete(t.id as string);
            done.add(t.id as string);
        }
    }
    return { waves, errors: [] };
}

/**
 * ─── AGENT DISPATCHER ────────────────────────────────────────────────
 *
 * Executes a plan DAG of tasks across agents:
 *   - Independent tasks run in parallel (bounded by `maxConcurrency`).
 *   - Dependent tasks wait for their dependencies (Kahn waves).
 *   - Tasks for the SAME agent are serialized (they share one worktree),
 *     preventing write collisions while different agents run concurrently.
 *   - A per-agent token ceiling stops runaway spend.
 *   - After execution: collision detection + signed evidence bundles.
 */
export class AgentDispatcher {
    public static async dispatch(plan: Plan, options: DispatchOptions = {}): Promise<DispatchReport> {
        const errors: string[] = [];
        const validation = PlanningEngine.validatePlan(plan);
        if (!validation.valid) {
            return {
                planId: plan.planId,
                ok: false,
                results: [],
                waves: [],
                totalTokens: 0,
                conflicts: [],
                mergedFiles: [],
                evidence: [],
                errors: validation.errors,
            };
        }

        const { waves, errors: waveErrors } = computeWaves(plan.tasks);
        errors.push(...waveErrors);

        const maxConcurrency = options.maxConcurrency ?? Math.max(1, Math.min(os.cpus()?.length || 2, 8));
        const sem = new Semaphore(maxConcurrency);
        const runner = options.runner ?? ((a, t, o) => AgentRuntime.runTurn(a, t, o));
        const projectRoot = options.projectRoot || process.cwd();
        const worktreeEnabled = options.worktree ?? true;

        const results: TaskResult[] = [];
        const failed = new Set<string>();
        const tokensByAgent = new Map<string, number>();

        const skip = (t: PlanTask, reason: string): void => {
            failed.add(t.id as string);
            results.push({
                id: t.id as string,
                agent: t.agent,
                ok: false,
                skipped: true,
                output: "",
                error: reason,
                durationMs: 0,
                tokens: 0,
                inputTokens: 0,
                outputTokens: 0,
            });
        };

        // Per-agent serialization (shared worktree safety).
        const agentChains = new Map<string, Promise<unknown>>();
        const withAgentLock = <T>(agent: string, fn: () => Promise<T>): Promise<T> => {
            const prev = agentChains.get(agent) ?? Promise.resolve();
            const next = prev.then(fn, fn);
            agentChains.set(agent, next.catch(() => undefined));
            return next;
        };

        for (const wave of waves) {
            const runnable: PlanTask[] = [];

            for (const t of wave) {
                if (t.dependencies.some((d) => failed.has(d as string))) {
                    skip(t, "Skipped: dependency failed");
                } else {
                    runnable.push(t);
                }
            }

            await Promise.all(
                runnable.map((t) =>
                    withAgentLock(t.agent, async () => {
                        await sem.acquire();
                        try {
                            const spent = tokensByAgent.get(t.agent) ?? 0;
                            if (options.perAgentTokenBudget !== undefined && spent >= options.perAgentTokenBudget) {
                                skip(t, `Per-agent token budget (${options.perAgentTokenBudget}) exhausted for ${t.agent}`);
                                return;
                            }

                            let currentAgent = t.agent;
                            let report: AgentTurnReport | null = null;
                            let lastError: string | undefined;
                            const maxAttempts = 1 + Math.max(0, options.maxRetries ?? 0);

                            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                                try {
                                    logger.info(`[DISPATCH] ${t.id} → ${currentAgent} (attempt ${attempt}/${maxAttempts})`);
                                    report = await runner(currentAgent, t.task, {
                                        cwd: projectRoot,
                                        worktree: worktreeEnabled,
                                        sandbox: options.sandbox,
                                        qualityGate: options.qualityGate,
                                        context: options.context,
                                    });
                                    if (report.ok) break;
                                    lastError = report.error || "Turn returned failure status";
                                } catch (err) {
                                    lastError = (err as Error).message || String(err);
                                    logger.warn(`[DISPATCH] ${t.id} worker failed on attempt ${attempt}: ${lastError}`);
                                }

                                if (attempt === maxAttempts && options.fallbackAgent) {
                                    const fallback = typeof options.fallbackAgent === "string"
                                        ? options.fallbackAgent
                                        : options.fallbackAgent[currentAgent];
                                    if (fallback && fallback !== currentAgent) {
                                        logger.info(`[DISPATCH] ${t.id} switching to fallback agent: ${fallback}`);
                                        currentAgent = fallback;
                                        try {
                                            report = await runner(currentAgent, t.task, {
                                                cwd: projectRoot,
                                                worktree: worktreeEnabled,
                                                sandbox: options.sandbox,
                                                qualityGate: options.qualityGate,
                                                context: options.context,
                                            });
                                            if (report.ok) break;
                                            lastError = report.error || "Fallback turn returned failure";
                                        } catch (fallbackErr) {
                                            lastError = (fallbackErr as Error).message || String(fallbackErr);
                                        }
                                    }
                                }
                            }

                            const safeReport: AgentTurnReport = report ?? {
                                agent: currentAgent,
                                ok: false,
                                output: "",
                                error: lastError || "Unknown execution failure",
                                exitCode: 1,
                                durationMs: 0,
                                timedOut: false,
                                adapterId: "fallback",
                                inputTokens: 0,
                                outputTokens: 0,
                                isolation: worktreeEnabled ? "worktree" : "main-tree",
                                sandbox: options.sandbox ? "active" : "off",
                            };

                            const tokens = safeReport.inputTokens + safeReport.outputTokens;
                            tokensByAgent.set(currentAgent, (tokensByAgent.get(currentAgent) ?? 0) + tokens);
                            if (!safeReport.ok) {
                                failed.add(t.id as string);
                                errors.push(`Task ${t.id} (${currentAgent}) failed: ${safeReport.error || "unknown"}`);
                            }

                            results.push({
                                id: t.id as string,
                                agent: currentAgent,
                                ok: safeReport.ok,
                                skipped: false,
                                output: safeReport.output,
                                error: safeReport.error,
                                durationMs: safeReport.durationMs,
                                tokens,
                                inputTokens: safeReport.inputTokens,
                                outputTokens: safeReport.outputTokens,
                            });
                        } finally {
                            sem.release();
                        }
                    }),
                ),
            );
        }

        // ─── Evidence + collision check (best-effort) ─────────────────────
        const changesByAgent: Record<string, string[]> = {};
        const evidence: EvidenceBundle[] = [];

        if (worktreeEnabled && options.collectEvidence !== false) {
            for (const r of results) {
                if (r.skipped) continue;
                const wt = resolveAgentWorktreePath(projectRoot, r.agent);
                const { files, diffStat } = collectWorktreeChanges(wt);
                if (files.length > 0) changesByAgent[r.agent] = [...(changesByAgent[r.agent] ?? []), ...files];

                evidence.push(
                    buildEvidenceBundle({
                        taskId: r.id,
                        agent: r.agent,
                        ok: r.ok,
                        changedFiles: files,
                        diffStat,
                        tokens: { input: r.inputTokens, output: r.outputTokens, total: r.tokens },
                        isolation: "worktree",
                        sandbox: options.sandbox ? "requested" : "off",
                    }),
                );
            }
        }

        const collisions = detectCollisions(changesByAgent);
        const totalTokens = [...tokensByAgent.values()].reduce((a, b) => a + b, 0);
        const ok = errors.length === 0 && results.length > 0 && results.every((r) => r.ok);

        let mergedFiles: string[] = [];
        if (options.mergeChanges && ok && collisions.length === 0) {
            const mergeRes = mergeWorktreeChanges(projectRoot, changesByAgent);
            mergedFiles = [...mergeRes.appliedFiles, ...mergeRes.deletedFiles];
        }

        return {
            planId: plan.planId,
            ok,
            results,
            waves: waves.map((w) => w.map((t) => t.id as string)),
            totalTokens,
            conflicts: collisions,
            mergedFiles,
            evidence,
            errors,
        };
    }
}
