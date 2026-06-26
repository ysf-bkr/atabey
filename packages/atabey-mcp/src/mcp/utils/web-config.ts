import fs from "fs";
import path from "path";
import { getFrameworkDir } from "atabey-mcp/../cli/utils/memory.js";

export interface WebConfig {
    projectPath: string;
    activeProvider: "gemini" | "claude" | "openai";
    geminiApiKey?: string;
    anthropicApiKey?: string;
    openaiApiKey?: string;
}

let cachedConfig: WebConfig | null = null;
let isOrchestratorRunning = false;
let activeOrchestratorAbortController: AbortController | null = null;

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
    // Default config uses the parent folder as fallback project path
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
    
    // Apply API keys to process.env so existing code modules can read them
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
    return {
        running: isOrchestratorRunning,
        projectPath: loadWebConfig().projectPath,
        activeProvider: loadWebConfig().activeProvider
    };
}

export function startOrchestratorLoop(): { success: boolean; message: string } {
    if (isOrchestratorRunning) {
        return { success: false, message: "Orchestrator is already running." };
    }
    
    const config = loadWebConfig();
    if (!fs.existsSync(config.projectPath)) {
        return { success: false, message: `Project path does not exist: ${config.projectPath}` };
    }

    isOrchestratorRunning = true;
    activeOrchestratorAbortController = new AbortController();

    // Trigger orchestration loop asynchronously
    import("../../cli/commands/orchestrate.js").then(async ({ orchestrateCommand }) => {
        try {
            // Pass target path and abort signal
            process.env.ATABEY_TEST_DIR = config.projectPath;
            // Run loop
            await orchestrateCommand({ signal: activeOrchestratorAbortController?.signal });
        } catch (e) {
            console.error("Orchestrator Loop Error:", e);
        } finally {
            isOrchestratorRunning = false;
        }
    }).catch(e => {
        isOrchestratorRunning = false;
        console.error("Failed to load orchestrate command", e);
    });

    return { success: true, message: "Orchestrator started successfully." };
}

export function stopOrchestratorLoop(): { success: boolean; message: string } {
    if (!isOrchestratorRunning) {
        return { success: false, message: "Orchestrator is not running." };
    }
    
    if (activeOrchestratorAbortController) {
        activeOrchestratorAbortController.abort();
    }
    isOrchestratorRunning = false;
    return { success: true, message: "Orchestrator stopped." };
}
