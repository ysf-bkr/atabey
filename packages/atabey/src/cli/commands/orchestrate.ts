import path from "path";
import { z } from "zod";
import { AgentExecutor } from "../../modules/engines/agent-executor.js";
import { RoutingEngine } from "../../modules/engines/routing-engine.js";
import { logger } from "../../shared/logger.js";
import { AgentRow, MessageRow, Storage } from "../../shared/storage.js";
import { stripMarkdownCodeBlocks } from "../../shared/string.js";
import { asAgentID, asTaskID, asTraceID } from "../../shared/types.js";
import { acquireMemoryLock, getFrameworkDir, releaseMemoryLock } from "../utils/memory.js";
import { sleep } from "../utils/time.js";
import { UI } from "../utils/ui.js";

export const HermesMessageSchema = z.object({
    timestamp: z.string(),
    from: z.string(),
    to: z.string(),
    category: z.enum(["ACTION", "DELEGATION", "SUBTASK", "REPLY", "ALERT"]),
    content: z.string(),
    traceId: z.string(),
    parentId: z.string().optional(),
    status: z.enum(["PENDING", "PROCESSED", "WAITING", "APPROVED"]),
    priority: z.enum(["HIGH", "NORMAL", "LOW"]).optional(),
    action: z.string().optional(),
    requiresApproval: z.boolean().optional(),
    dependencies: z.array(z.string()).optional(),
});

export type HermesMessage = z.infer<typeof HermesMessageSchema>;

let isLooping = false;

export async function orchestrateCommand(options?: { maxIterations?: number }) {
    const readline = await import("readline");
    readline.cursorTo(process.stdout, 0, 0);
    readline.clearScreenDown(process.stdout);

    const maxIterations = options?.maxIterations;
    let iterationCount = 0;

    isLooping = true;

    while (isLooping) {
        try {
            // 1. Agent timeout check (30 min)
            const agents: AgentRow[] = Storage.getAllAgents();
            for (const agent of agents) {
                if (agent.state === "EXECUTING" && agent.last_updated) {
                    const lastUpdatedTime = Date.parse(agent.last_updated);
                    if (!isNaN(lastUpdatedTime) && Date.now() - lastUpdatedTime > 30 * 60 * 1000) {
                        Storage.updateAgentStatus(agent.name, "READY", "Idle (Recovered from Timeout)");
                    }
                }
            }

            // 2. Get pending messages
            const pendingMessages: MessageRow[] = Storage.getPendingMessages() || [];

            // 3. Dashboard render
            const traceId = Storage.getMetadata("traceId") || "N/A";
            const phase = Storage.getMetadata("phase") || "N/A";
            const logs = Storage.getLogs();

            UI.renderDashboard({
                traceId,
                phase,
                agents: Storage.getAllAgents().map(a => ({ name: a.name, state: a.state, task: a.task })),
                pendingCount: pendingMessages.length,
                logs: logs.map(l => ({ timestamp: l.timestamp, agent: l.agent, action: l.action, summary: l.summary }))
            });

            if (pendingMessages.length > 0) {
                // Acquire memory lock before processing messages
                const lockPath = path.join(getFrameworkDir(), "messages", ".lock");
                let lockAcquired = false;
                for (let lockAttempt = 0; lockAttempt < 3; lockAttempt++) {
                    if (acquireMemoryLock(lockPath)) {
                        lockAcquired = true;
                        break;
                    }
                    await sleep(500);
                }

                if (!lockAcquired) {
                    UI.warning("Could not acquire memory lock, assuming stale lock and proceeding...");
                    releaseMemoryLock(lockPath);
                }

                try {
                    for (const msg of pendingMessages) {
                        // Dependency Check
                        if (msg.parentId) {
                            const tasks = Storage.getTasks(asTraceID(msg.traceId));
                            const task = tasks.find(t => t.id === msg.parentId);
                            if (task && task.dependencies.length > 0) {
                                const incompleteDeps = tasks.filter(t => task.dependencies.includes(t.id) && t.status !== "COMPLETED");
                                if (incompleteDeps.length > 0) {
                                    continue;
                                }
                            }
                        }

                        // Risk Engine check
                        let riskFlag = false;
                        try {
                            const { RiskEngine } = await import("../../modules/engines/risk-engine.js");
                            const assessment = RiskEngine.assessTaskRisk(msg.content);
                            if (assessment.requiresApproval) {
                                riskFlag = true;
                            }
                        } catch (err) {
                            logger.debug("Risk engine not available, continuing without risk assessment", err);
                        }

                        // If human approval is required
                        if ((msg.category === "ACTION" || msg.category === "ALERT" || riskFlag) && (msg.requiresApproval || riskFlag) && msg.status !== "APPROVED") {
                            readline.cursorTo(process.stdout, 0, process.stdout.rows ? process.stdout.rows - 2 : 20);
                            readline.clearScreenDown(process.stdout);
                            UI.warning(`\n[WARN]  [APPROVAL REQUEST] Trace ${msg.traceId} requires approval:`);
                            UI.warning(`   Description: ${msg.content}`);

                            const approved = await askUserApproval(msg.traceId, msg.content);

                            if (approved && msg.id !== undefined) {
                                Storage.updateMessageStatus(msg.id, "APPROVED");
                                Storage.saveLog({
                                    agent: "@human",
                                    action: "APPROVED",
                                    trace_id: msg.traceId,
                                    status: "SUCCESS",
                                    summary: `Trace ${msg.traceId} approved`,
                                });
                            } else if (msg.id !== undefined) {
                                Storage.updateMessageStatus(msg.id, "PROCESSED");
                                Storage.saveLog({
                                    agent: "@human",
                                    action: "REJECTED",
                                    trace_id: msg.traceId,
                                    status: "FAILED",
                                    summary: `Trace ${msg.traceId} rejected`,
                                });
                                continue;
                            }
                        }

                        // Target agent: skip RoutingEngine if @manager explicitly specified
                        const agentName: string = (msg.category === "DELEGATION" || msg.category === "SUBTASK") && String(msg.to) === "@manager"
                            ? (() => {
                                try {
                                    const r = RoutingEngine.resolveWithDetails(msg.content);
                                    logger.debug(`RoutingEngine: ${msg.content} → ${r.agent} (score: ${r.score})`);
                                    return r.agent;
                                } catch {
                                    return String(msg.to);
                                }
                            })()
                            : String(msg.to);
                        // Extract task description
                        let taskDescription = msg.content;
                        try {
                            const cleanedContent = stripMarkdownCodeBlocks(msg.content);
                            const payload = JSON.parse(cleanedContent);
                            taskDescription = payload.task || msg.content;
                        } catch {
                            taskDescription = msg.content;
                        }

                        // Execute the task via AgentExecutor
                        UI.agentBox(agentName, `Executing: ${taskDescription.substring(0, 60)}...`);
                        const result = await AgentExecutor.execute(taskDescription, msg.traceId);

                        if (result.success) {
                            UI.success(`${agentName} completed task successfully (${result.attempts} attempt(s))`);
                            logger.info(`[ORCHESTRATE] ${agentName} completed: ${taskDescription.substring(0, 80)}`, {
                                agent: agentName,
                                traceId: msg.traceId,
                                attempts: result.attempts,
                            });
                        } else {
                            UI.error(`${agentName} FAILED after ${result.attempts} attempts`);
                            logger.error(`[ORCHESTRATE] ${agentName} failed: ${taskDescription.substring(0, 80)}`, {
                                agent: agentName,
                                traceId: msg.traceId,
                                output: result.output,
                            });
                        }

                        if (msg.id !== undefined) {
                            Storage.updateMessageStatus(msg.id, "PROCESSED");
                        }
                    }

                    // Markdown sync
                    const { syncMarkdownMemory } = await import("../utils/memory.js");
                    syncMarkdownMemory();
                } finally {
                    // Always release the lock after processing
                    releaseMemoryLock(lockPath);
                }
            }
        } catch (globalLoopErr) {
            UI.error(`[WARN]  Critical error in Hermes orchestration loop: ${(globalLoopErr as Error).message}`);
        }

        iterationCount++;
        if (maxIterations !== undefined && iterationCount >= maxIterations) {
            isLooping = false;
            break;
        }

        await sleep(2000);
    }
}

/**
 * Standard for sending messages between agents.
 * Agents use this function to communicate via Hermes message queue.
 */
export async function sendMessage(args: {
    from: string;
    to: string;
    category: "ACTION" | "DELEGATION" | "SUBTASK" | "REPLY" | "ALERT";
    content: string;
    traceId: string;
    parentId?: string;
    priority?: "HIGH" | "NORMAL" | "LOW";
    requiresApproval?: boolean;
    dependencies?: string[];
}) {
    try {
        const message: MessageRow = {
            timestamp: new Date().toISOString(),
            from: asAgentID(args.from),
            to: asAgentID(args.to),
            category: args.category,
            content: args.content,
            traceId: asTraceID(args.traceId),
            parentId: args.parentId ? asTaskID(args.parentId) : undefined,
            status: "PENDING",
            priority: args.priority || "NORMAL",
            requiresApproval: args.requiresApproval || false
        };

        Storage.saveMessage(message);
        return message;
    } catch (err) {
        UI.error(`Message could not be delivered: ${args.from} -> ${args.to}`);
        logger.debug("Hermes sendMessage failed", err);
    }
}

async function askUserApproval(_traceId: string, _content: string): Promise<boolean> {
    if (process.env.ATABEY_TEST_DIR || !process.stdin.isTTY) {
        return false;
    }
    const readline = await import("readline");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question("[INFO] Approve this operation? (y/N): ", (answer) => {
            rl.close();
            const cleanAnswer = answer.trim().toLowerCase();
            resolve(cleanAnswer === "y" || cleanAnswer === "yes");
        });
    });
}
