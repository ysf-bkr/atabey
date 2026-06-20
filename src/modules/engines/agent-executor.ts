import { logger } from "../../shared/logger.js";
import { maskObject, maskText } from "../../shared/pii.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { asAgentID, asTraceID } from "../../shared/types.js";
import { CoreMemory } from "../memory/core.js";
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

        // 2. Execute with retry logic (max 3 attempts)
        let lastOutput = "";
        let lastError = "";

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                logger.info(`[EXECUTOR] Attempt ${attempt}/3: ${agent} executing...`);

                // Execute the agent task via Hermes messaging
                const output = await AgentExecutor.runAgentTask(agent, taskDescription, subTasks, traceId);
                lastOutput = output;

                // 3. Quality check
                const qualityResult = await QualityGate.check(agent, output, taskDescription);

                if (qualityResult.passed) {
                    logger.info(`[EXECUTOR] ${agent} task PASSED quality check (attempt ${attempt})`);

                    // 4. Save to memory
                    await AgentExecutor.saveToMemory(agent, taskDescription, output, traceId);

                    // Update agent status
                    AtabeyStorage.updateAgentStatus(agent.replace("@", ""), "COMPLETED", taskDescription);

                    return {
                        success: true,
                        agent,
                        output,
                        attempts: attempt,
                    };
                }

                lastError = qualityResult.reason;
                logger.warn(`[EXECUTOR] Quality check FAILED: ${qualityResult.reason}`, { agent, attempt });
            } catch (err) {
                lastError = (err as Error).message;
                logger.error(`[EXECUTOR] Agent execution error: ${lastError}`, { agent, attempt });
            }
        }

        // All attempts failed
        logger.error(`[EXECUTOR] ${agent} FAILED after 3 attempts. Last error: ${lastError}`);

        AtabeyStorage.updateAgentStatus(agent.replace("@", ""), "BLOCKED", `Failed: ${taskDescription.substring(0, 60)}`);

        return {
            success: false,
            agent,
            output: lastOutput,
            attempts: 3,
        };
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

        AtabeyStorage.updateAgentStatus(normalizedName, "COMPLETED", task);
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
        const maskedTask = maskText(taskDescription);
        const maskedSubTasks = subTasks.map(st => maskText(st));
        // [KVKK/GDPR] Strict mode: mask any object fields that may contain PII
        const safePayload = maskObject({
            type: "DELEGATION",
            task: maskedTask,
            subTasks: maskedSubTasks,
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

        // Log action
        AtabeyStorage.getDB().prepare(`
            INSERT INTO logs (agent, action, trace_id, status, summary)
            VALUES (?, ?, ?, ?, ?)
        `).run(agentName, "DELEGATION_SENT", traceId, "IN_PROGRESS", maskedTask.substring(0, 200));

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

                // [KVKK/GDPR] Mask PII in response content before logging
                const maskedResponse = maskText(response.content);
                AtabeyStorage.getDB().prepare(`
                    INSERT INTO logs (agent, action, trace_id, status, summary)
                    VALUES (?, ?, ?, ?, ?)
                `).run(agentName, "RESPONSE_RECEIVED", traceId, "SUCCESS", maskedResponse.substring(0, 200));

                logger.info(`[HERMES] Response received from @${agentName} (trace: ${traceId})`);
                return response.content;
            }

            // Short delay before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        // Timeout — agent did not respond
        const timeoutMsg = `[TIMEOUT] @${agentName} did not respond within ${(maxAttempts * pollInterval) / 1000}s. Ensure AgentLoop is running or a provider is configured.`;
        logger.warn(`[HERMES] ${timeoutMsg} (trace: ${traceId})`);

        AtabeyStorage.getDB().prepare(`
            INSERT INTO logs (agent, action, trace_id, status, summary)
            VALUES (?, ?, ?, ?, ?)
        `).run(agentName, "RESPONSE_TIMEOUT", traceId, "FAILED", timeoutMsg);

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
        AtabeyStorage.getDB().prepare(`
            INSERT INTO logs (agent, action, trace_id, status, summary)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            agent.replace("@", ""),
            "COMPLETED",
            traceId,
            "SUCCESS",
            maskedOutput.substring(0, 200),
        );

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
