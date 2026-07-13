import {
    getCircuitBreaker,
    withRetry
} from "atabey-shared/resilience.js";
import { logger } from "../../shared/logger.js";
import { maskObject, maskText } from "../../shared/pii.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { asAgentID, asTraceID } from "../../shared/types.js";
import { CoreMemory } from "../memory/core.js";
import { EvaluationEngine } from "./evaluation-engine.js";
import { QualityGate } from "./quality-gate.js";
import { RoutingEngine, RoutingResult } from "./routing-engine.js";

/**
 * [ENGINE] Agent Executor — Production Implementation
 *
 * Manages real agent calls through the Hermes messaging system.
 * Distributes tasks to agents, collects results, passes through quality gate,
 * and saves to memory.
 *
 * Uses real Hermes message queue (not simulated).
 */
export class AgentExecutor {
    /**
     * Distributes a task to the relevant agent and executes it.
     * 1. Select the best agent via Routing Engine
     * 2. Send Hermes message
     * 3. Wait for agent response (polling)
     * 4. Pass through quality check
     * 5. Save result to memory
     */
    public static async execute(taskDescription: string, traceId: string): Promise<{
        success: boolean;
        agent: string;
        output: string;
        attempts: number;
    }> {
        // 1. Route the task to the best agent
        const routingResult: RoutingResult = RoutingEngine.resolveWithDetails(taskDescription);
        const agent = routingResult.agent;
        const subTasks = routingResult.subTasks;

        logger.info(`[EXECUTOR] Routing: ${taskDescription.substring(0, 80)}... → ${agent} (confidence: ${routingResult.confidence})`);

        // 2. Execute with exponential backoff + circuit breaker (Polly-style, no external deps)
        let lastOutput = "";
        let attemptsUsed = 0;
        const breaker = getCircuitBreaker(`agent:${agent}`, {
            failureThreshold: 5,
            openMs: 30_000,
            name: `agent:${agent}`,
        });

        // Check circuit breaker state upfront — fail fast if open
        try {
            breaker.exec(() => Promise.resolve()); // dry-run to check state
        } catch {
            return {
                success: false,
                agent,
                output: "",
                attempts: 0,
            };
        }

        try {
            const result = await withRetry(
                async (attempt) => {
                    attemptsUsed = attempt;
                    const startTime = Date.now();
                    logger.info(`[EXECUTOR] Attempt ${attempt}/3: ${agent} executing...`);

                    const output = await AgentExecutor.runAgentTask(agent, taskDescription, subTasks, traceId);
                    lastOutput = output;

                    const qualityResult = await QualityGate.check(agent, output, taskDescription);
                    if (!qualityResult.passed) {
                        logger.warn(`[EXECUTOR] Quality check FAILED: ${qualityResult.reason}`, {
                            agent,
                            attempt,
                        });
                        // Track failure in circuit breaker
                        breaker.exec(() => Promise.reject(new Error(`QUALITY_GATE: ${qualityResult.reason}`)))
                            .catch(() => {});
                        // Retry quality failures with backoff
                        throw new Error(`QUALITY_GATE: ${qualityResult.reason}`);
                    }

                    // Track success in circuit breaker
                    breaker.exec(() => Promise.resolve()).catch(() => {});

                    const durationMs = Date.now() - startTime;
                    logger.info(`[EXECUTOR] ${agent} task PASSED quality check (attempt ${attempt})`);

                    await AgentExecutor.saveToMemory(agent, taskDescription, output, traceId);
                    AtabeyStorage.updateAgentStatus(agent.replace("@", ""), "COMPLETED", taskDescription);

                    try {
                        EvaluationEngine.evaluateTask(traceId, agent, durationMs, taskDescription);
                    } catch (evalErr) {
                        logger.error(
                            `[EXECUTOR] Failed to evaluate task for ${agent}: ${(evalErr as Error).message}`,
                        );
                    }

                    return {
                        success: true as const,
                        agent,
                        output,
                        attempts: attempt,
                    };
                },
                {
                    maxAttempts: 3,
                    baseDelayMs: 200,
                    maxDelayMs: 5_000,
                    factor: 2,
                    jitter: true,
                    retryIf: () => {
                        // All errors retry (circuit was checked upfront)
                        return true;
                    },
                    onRetry: (err, attempt, delayMs) => {
                        logger.warn(
                            `[EXECUTOR] Retry ${attempt} for ${agent} in ${delayMs}ms: ${
                                err instanceof Error ? err.message : String(err)
                            }`,
                        );
                    },
                },
            );
            return result;
        } catch (err) {
            const lastError = err instanceof Error ? err.message : String(err);
            logger.error(`[EXECUTOR] ${agent} FAILED after ${attemptsUsed || 3} attempts. Last error: ${lastError}`);
            AtabeyStorage.updateAgentStatus(
                agent.replace("@", ""),
                "BLOCKED",
                `Failed: ${taskDescription.substring(0, 60)}`,
            );
            return {
                success: false,
                agent,
                output: lastOutput,
                attempts: attemptsUsed || 3,
            };
        }
    }

    /**
     * Directly acknowledges a task for a specific agent.
     * Called by AgentLoop when a DELEGATION message is received.
     * LLM execution is handled by the AI interface (Claude Code / Gemini CLI / Cursor).
     * Writes a RESPONSE message back to Hermes for the executor to pick up.
     */
    public static async executeForAgent(
        agentName: string,
        task: string,
        traceId: string,
    ): Promise<string> {
        const normalizedName = agentName.replace("@", "");

        logger.info(`[EXECUTOR] executeForAgent: ${agentName} acknowledged`, {
            agent: agentName,
            traceId,
            task: task.substring(0, 80),
        });

        AtabeyStorage.updateAgentStatus(normalizedName, "EXECUTING", task);

        // LLM execution is handled by the AI interface (Claude Code / Gemini CLI / Cursor)
        // Atabey acts as the MCP tool server — the AI interface calls the tools directly
        const responseContent = `[AGENT:${agentName}] Task acknowledged. The AI interface (Claude Code / Gemini CLI / Cursor) will handle execution via MCP tools. Task: ${task}`;
        logger.info(`[EXECUTOR] Task acknowledged for ${agentName}`, { traceId });

        // Write RESPONSE back to Hermes so pollForAgentResponse can pick it up
        AtabeyStorage.saveMessage({
            from: asAgentID(agentName),
            to: asAgentID("@manager"),
            category: "RESPONSE" as const,
            content: responseContent,
            traceId: asTraceID(traceId),
            timestamp: new Date().toISOString(),
            status: "PENDING" as const,
            priority: "HIGH" as const,
            requiresApproval: false,
        });

        AtabeyStorage.updateAgentStatus(normalizedName, "ACKNOWLEDGED", task);
        return responseContent;
    }

    private static async runAgentTask(
        agent: string,
        taskDescription: string,
        subTasks: string[],
        traceId: string,
    ): Promise<string> {
        const agentName = agent.replace("@", "");
        const from = "@manager";

        // ─── 1. Send Hermes Message ──────────────────────────────────────
        // [KVKK/GDPR] Mask PII in task description before sending to message queue
        // maskObject handles all string fields recursively — no need for pre-masking
        const safePayload = maskObject({
            type: "DELEGATION",
            task: taskDescription,
            subTasks,
            traceId,
            from,
        }, 0, true) as Record<string, unknown>;
        const messagePayload = JSON.stringify(safePayload);

        AtabeyStorage.saveMessage({
            from: asAgentID(from),
            to: asAgentID(agent),
            category: "DELEGATION" as const,
            content: messagePayload,
            traceId: asTraceID(traceId),
            timestamp: new Date().toISOString(),
            status: "PENDING" as const,
            priority: "HIGH" as const,
            requiresApproval: false,
        });

        // Update agent status
        AtabeyStorage.updateAgentStatus(agentName, "EXECUTING", taskDescription);

        AtabeyStorage.saveLog({
            agent: agentName,
            action: "DELEGATION_SENT",
            trace_id: traceId,
            status: "IN_PROGRESS",
            summary: typeof safePayload.task === "string" ? safePayload.task.substring(0, 200) : taskDescription.substring(0, 200)
        });

        logger.info(`[HERMES] Delegation sent to ${agent} (trace: ${traceId})`);

        // ─── 2. Wait for Agent Response (Polling) ────────────────────────
        const output = await AgentExecutor.pollForAgentResponse(agentName, traceId);

        return output;
    }

    /**
     * Polls for agent response from the Hermes message queue.
     *
     * Polling strategy:
     * - Check every 500ms
     * - Max 10 seconds wait (20 attempts)
     * - Return response if found, timeout if not
     */
    private static async pollForAgentResponse(agentName: string, traceId: string): Promise<string> {
        const maxAttempts = 20; // 10 seconds (500ms * 20) — AgentLoop responds much faster
        const pollInterval = 500; // 500ms

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // Check RESPONSE messages sent by the agent
            const messages = AtabeyStorage.getPendingMessages();
            const response = messages.find(
                m => m.from.replace("@", "") === agentName
                     && m.category === "RESPONSE"
                     && m.traceId === traceId
                     && m.status === "PENDING"
            );

            if (response) {
                // Mark message as processed
                if (response.id !== undefined) {
                    AtabeyStorage.updateMessageStatus(response.id as number, "PROCESSED");
                }

                // [KVKK/GDPR] Mask PII in response content before logging and returning
                const maskedResponse = maskText(response.content);

                AtabeyStorage.saveLog({
                    agent: agentName,
                    action: "RESPONSE_RECEIVED",
                    trace_id: traceId,
                    status: "SUCCESS",
                    summary: maskedResponse.substring(0, 200)
                });

                logger.info(`[HERMES] Response received from @${agentName} (trace: ${traceId})`);
                return maskedResponse;
            }

            // Short delay before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // Timeout — agent did not respond
        const timeoutMsg = `[TIMEOUT] @${agentName} did not respond within ${(maxAttempts * pollInterval) / 1000}s. Ensure AgentLoop is running or a provider is configured.`;
        logger.warn(`[HERMES] ${timeoutMsg} (trace: ${traceId})`);

        AtabeyStorage.saveLog({
            agent: agentName,
            action: "RESPONSE_TIMEOUT",
            trace_id: traceId,
            status: "FAILED",
            summary: timeoutMsg
        });

        return timeoutMsg;
    }

    /**
     * Saves the task result to memory.
     */
    private static async saveToMemory(
        agent: string,
        taskDescription: string,
        output: string,
        traceId: string,
    ): Promise<void> {
        // [KVKK/GDPR] Mask PII before saving to memory
        const maskedTask = maskText(taskDescription);
        const maskedOutput = maskText(output);

        // Save to Vector Memory
        await CoreMemory.remember({
            content: `${agent}: ${maskedTask}\nResult: ${maskedOutput}`,
            category: "TASK_HISTORY",
            traceId: asTraceID(traceId),
            tags: [agent.replace("@", ""), "task-execution"],
        });

        // Save to SQLite logs
        AtabeyStorage.saveLog({
            agent: agent.replace("@", ""),
            action: "COMPLETED",
            trace_id: traceId,
            status: "SUCCESS",
            summary: maskedOutput.substring(0, 200)
        });

        // Update task status
        const tasks = AtabeyStorage.getTasks(asTraceID(traceId));
        const pendingTask = tasks.find(t => t.status === "IN_PROGRESS");
        if (pendingTask) {
            AtabeyStorage.saveTask({
                ...pendingTask,
                status: "COMPLETED",
            });
        }
    }
}
