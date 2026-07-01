import fs from "fs";
import path from "path";
import { ORCHESTRATOR } from "atabey-shared/constants.js";

let timeoutHandle: ReturnType<typeof setInterval> | null = null;
let orchestratorActive = false;

export function isOrchestratorActive(): boolean {
    return orchestratorActive;
}

interface AtabeyConfig {
    agents?: string[];
    orchestrator?: {
        autoStart?: boolean;
        intervalMs?: number;
    };
}

function readConfig(projectRoot: string): AtabeyConfig | null {
    const configPath = path.join(projectRoot, ".atabey", "config.json");
    if (!fs.existsSync(configPath)) return null;
    try {
        return JSON.parse(fs.readFileSync(configPath, "utf8")) as AtabeyConfig;
    } catch {
        return null;
    }
}

export function shouldAutoStartOrchestrator(projectRoot: string): boolean {
    const envVal = process.env[ORCHESTRATOR.AUTO_START_ENV];
    if (envVal !== undefined) {
        return envVal !== "false" && envVal !== "0";
    }
    const config = readConfig(projectRoot);
    if (config?.orchestrator?.autoStart === false) return false;
    return ORCHESTRATOR.DEFAULT_AUTO_START;
}

export function getOrchestratorIntervalMs(projectRoot: string): number {
    const envVal = process.env[ORCHESTRATOR.INTERVAL_MS_ENV];
    if (envVal) {
        const parsed = parseInt(envVal, 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    const config = readConfig(projectRoot);
    if (config?.orchestrator?.intervalMs && config.orchestrator.intervalMs > 0) {
        return config.orchestrator.intervalMs;
    }
    return ORCHESTRATOR.DEFAULT_INTERVAL_MS;
}

function resolveActiveAgents(projectRoot: string): string[] {
    const config = readConfig(projectRoot);
    if (!config?.agents?.length) return [];
    return config.agents.map((a) => (a.startsWith("@") ? a : `@${a}`));
}

/**
 * Start the headless Hermes orchestrator (AgentLoop + timeout recovery).
 * Safe to call multiple times — no-ops if already running.
 */
export async function bootstrapOrchestrator(
    projectRoot: string,
    options?: { force?: boolean },
): Promise<{ started: boolean; message: string }> {
    if (!options?.force && !shouldAutoStartOrchestrator(projectRoot)) {
        return { started: false, message: "Orchestrator auto-start disabled." };
    }

    process.env.ATABEY_PROJECT_ROOT = projectRoot;

    const { AgentLoop } = await import("atabey/src/modules/engines/agent-loop.js");
    if (AgentLoop.isRunning() || orchestratorActive) {
        orchestratorActive = true;
        return { started: true, message: "Orchestrator already running." };
    }

    const intervalMs = getOrchestratorIntervalMs(projectRoot);
    const activeAgents = resolveActiveAgents(projectRoot);
    AgentLoop.start(activeAgents, intervalMs);

    if (!timeoutHandle) {
        const { Storage } = await import("atabey/src/shared/storage.js");
        timeoutHandle = setInterval(() => {
            try {
                const agents = Storage.getAllAgents();
                for (const agent of agents) {
                    if (agent.state === "EXECUTING" && agent.last_updated) {
                        const lastUpdatedTime = Date.parse(agent.last_updated);
                        if (!isNaN(lastUpdatedTime) && Date.now() - lastUpdatedTime > 30 * 60 * 1000) {
                            Storage.updateAgentStatus(agent.name, "READY", "Idle (Recovered from Timeout)");
                        }
                    }
                }
            } catch {
                /* ignore recovery errors */
            }
        }, 60_000);
    }

    orchestratorActive = true;
    process.stderr.write(`[atabey-mcp] Orchestrator auto-started (AgentLoop, ${intervalMs}ms)\n`);
    return { started: true, message: "Orchestrator auto-started." };
}

export async function shutdownOrchestrator(): Promise<void> {
    const { AgentLoop } = await import("atabey/src/modules/engines/agent-loop.js");
    AgentLoop.stop();
    orchestratorActive = false;
    if (timeoutHandle) {
        clearInterval(timeoutHandle);
        timeoutHandle = null;
    }
}