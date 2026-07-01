import fs from "fs";
import path from "path";
import { getFrameworkDir } from "atabey/src/cli/utils/memory.js";
import {
    bootstrapOrchestrator,
    isOrchestratorActive,
    shutdownOrchestrator,
} from "./orchestrator-bootstrap.js";

export interface WebConfig {
    projectPath: string;
    activeProvider: "gemini" | "claude" | "openai";
    geminiApiKey?: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
}

let cachedConfig: WebConfig | null = null;

function getConfigPath(): string {
    const dir = getFrameworkDir();
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, "web_config.json");
}

/**
 * Load configuration from disk
 */
export function loadWebConfig(): WebConfig {
    if (cachedConfig) return cachedConfig;
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
        try {
            const raw = fs.readFileSync(configPath, "utf8");
            cachedConfig = JSON.parse(raw);
            return cachedConfig!;
        } catch {
            // fallback
        }
    }
    cachedConfig = {
        projectPath: path.resolve(getFrameworkDir(), "../"),
        activeProvider: "gemini",
    };
    return cachedConfig;
}

/**
 * Save configuration to disk
 */
export function saveWebConfig(config: Partial<WebConfig>): WebConfig {
    const current = loadWebConfig();
    const updated = { ...current, ...config };

    if (updated.geminiApiKey) process.env.GEMINI_API_KEY = updated.geminiApiKey;
    if (updated.anthropicApiKey) process.env.ANTHROPIC_API_KEY = updated.anthropicApiKey;
    if (updated.openaiApiKey) process.env.OPENAI_API_KEY = updated.openaiApiKey;
    if (updated.projectPath) process.env.ATABEY_TEST_DIR = updated.projectPath;

    fs.writeFileSync(getConfigPath(), JSON.stringify(updated, null, 2), "utf8");
    cachedConfig = updated;
    return updated;
}

/**
 * Orchestrator active state helpers
 */
export function getOrchestratorState() {
    const config = loadWebConfig();
    return {
        running: isOrchestratorActive(),
        projectPath: config.projectPath,
        activeProvider: config.activeProvider,
    };
}

export function startOrchestratorLoop(): { success: boolean; message: string } {
    const config = loadWebConfig();
    if (!fs.existsSync(config.projectPath)) {
        return { success: false, message: `Project path does not exist: ${config.projectPath}` };
    }

    bootstrapOrchestrator(config.projectPath, { force: true })
        .then((result) => {
            if (!result.started) {
                process.stderr.write(`[atabey-mcp] Orchestrator start skipped: ${result.message}\n`);
            }
        })
        .catch((e) => {
            process.stderr.write(`Orchestrator Loop Error: ${(e as Error).message}\n`);
        });

    return { success: true, message: "Orchestrator started successfully." };
}

export function stopOrchestratorLoop(): { success: boolean; message: string } {
    shutdownOrchestrator()
        .then(() => undefined)
        .catch((e) => {
            process.stderr.write(`Orchestrator stop error: ${(e as Error).message}\n`);
        });
    return { success: true, message: "Orchestrator stopped." };
}