import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { AgentExecutor } from "./agent-executor.js";

/**
 * [ENGINE] AgentLoop — Real-time Hermes Message Consumer
 *
 * Runs as a background loop polling and consuming DELEGATION messages from the
 * Hermes queue and forwarding them to agents for acknowledgment.
 *
 * Acts as a message-polling and workflow enforcer, ensuring task messages are
 * routed to their designated target agents, which then get processed by the AI client interface.
 *
 * v0.0.14: First real implementation. Agents are now real.
 */
export class AgentLoop {
    private static loopHandle: ReturnType<typeof setInterval> | null = null;
    private static running = false;

    /**
     * Start the agent dispatch loop.
     * @param activeAgents - Agent names to process (empty = all registered agents)
     * @param intervalMs   - Poll interval in milliseconds (default: 1000ms)
     */
    public static start(activeAgents: string[] = [], intervalMs = 1000): void {
        if (this.running) {
            logger.warn("[AGENT_LOOP] Loop already running. Ignoring duplicate start.");
            return;
        }
        this.running = true;
        logger.info(
            `[AGENT_LOOP] Starting. Active agents: ${
                activeAgents.length === 0 ? "all" : activeAgents.join(", ")
            } | Interval: ${intervalMs}ms`,
        );

        this.loopHandle = setInterval(() => {
            this.processDelegations(activeAgents).catch((err: unknown) => {
                logger.error("[AGENT_LOOP] Error in dispatch cycle", {
                    error: (err as Error).message,
                });
            });
        }, intervalMs);
    }

    /**
     * Stop the agent dispatch loop gracefully.
     */
    public static stop(): void {
        if (this.loopHandle) {
            clearInterval(this.loopHandle);
            this.loopHandle = null;
        }
        this.running = false;
        logger.info("[AGENT_LOOP] Stopped.");
    }

    /**
     * Returns whether the loop is currently running.
     */
    public static isRunning(): boolean {
        return this.running;
    }

    /**
     * Single dispatch cycle — reads pending DELEGATION messages and executes them.
     * Marks each message as PROCESSED immediately to prevent duplicate dispatch.
     */
    private static async processDelegations(activeAgents: string[]): Promise<void> {
        const pendingMessages = AtabeyStorage.getPendingMessages();
        const delegations = pendingMessages.filter(
            m => m.category === "DELEGATION" && m.status === "PENDING",
        );

        if (delegations.length === 0) return;

        logger.debug(`[AGENT_LOOP] Processing ${delegations.length} pending DELEGATION(s)`);

        for (const msg of delegations) {
            const rawTarget = String(msg.to);
            const agentName = rawTarget.startsWith("@") ? rawTarget : `@${rawTarget}`;

            // If activeAgents is specified, only process those agents
            if (activeAgents.length > 0 && !activeAgents.includes(agentName)) {
                continue;
            }

            // Mark as PROCESSED immediately to prevent duplicate processing
            if (msg.id !== undefined) {
                AtabeyStorage.updateMessageStatus(msg.id as number, "PROCESSED");
            }

            // Parse task from message content (may be JSON or plain text)
            let taskDescription = msg.content;
            try {
                const parsed = JSON.parse(msg.content) as { task?: string };
                if (parsed.task) taskDescription = parsed.task;
            } catch {
                // Content is plain text task description — use as-is
            }

            logger.info(`[AGENT_LOOP] Dispatching → ${agentName}`, {
                traceId: String(msg.traceId),
                task: taskDescription.substring(0, 80),
            });

            try {
                await AgentExecutor.executeForAgent(
                    agentName,
                    taskDescription,
                    String(msg.traceId),
                );
            } catch (err: unknown) {
                logger.error(`[AGENT_LOOP] Failed to execute task for ${agentName}`, {
                    error: (err as Error).message,
                    traceId: String(msg.traceId),
                });
            }
        }
    }
}
