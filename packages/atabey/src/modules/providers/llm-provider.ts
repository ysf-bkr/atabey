/**
 * [PROVIDER] LLM Provider — Multi-Model AI Execution Engine
 *
 * Enables Atabey to directly call LLM agents (OpenAI, Anthropic, local models)
 * instead of relying solely on external AI interfaces (Claude Code, Gemini CLI).
 *
 * Supports:
 * - OpenAI: gpt-4, gpt-4-turbo, gpt-3.5-turbo
 * - Anthropic: claude-3-opus, claude-3-sonnet, claude-3-haiku
 * - Local: Ollama, LM Studio (compatible endpoints)
 *
 * Falls back gracefully if API keys are not configured.
 */

import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

export type LLMProviderType = "openai" | "anthropic" | "local" | "none";

export interface LLMProviderConfig {
    type: LLMProviderType;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
}

export interface LLMCompletionRequest {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
}

export interface LLMCompletionResponse {
    content: string;
    model: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

/**
 * LLM Provider — routes completion requests to the configured model.
 * Reads config from environment variables:
 *   ATABEY_LLM_PROVIDER  = "openai" | "anthropic" | "local"
 *   ATABEY_LLM_API_KEY   = your API key
 *   ATABEY_LLM_MODEL     = model name (e.g. "gpt-4", "claude-3-opus-20240229")
 *   ATABEY_LLM_BASE_URL  = custom endpoint (for local/Ollama)
 */
export class LLMProvider {
    private static config: LLMProviderConfig = LLMProvider.loadConfig();

    /**
     * Loads configuration from environment variables.
     */
    private static loadConfig(): LLMProviderConfig {
        const provider = (process.env.ATABEY_LLM_PROVIDER || "none") as LLMProviderType;
        return {
            type: provider,
            apiKey: process.env.ATABEY_LLM_API_KEY,
            model: process.env.ATABEY_LLM_MODEL || LLMProvider.defaultModel(provider),
            baseUrl: process.env.ATABEY_LLM_BASE_URL,
            maxTokens: parseInt(process.env.ATABEY_LLM_MAX_TOKENS || "2048", 10),
            temperature: parseFloat(process.env.ATABEY_LLM_TEMPERATURE || "0.7"),
        };
    }

    private static defaultModel(provider: LLMProviderType): string {
        switch (provider) {
            case "openai": return "gpt-4-turbo";
            case "anthropic": return "claude-3-sonnet-20240229";
            case "local": return "llama3";
            default: return "none";
        }
    }

    /**
     * Reloads configuration from environment (useful after config change).
     */
    public static reloadConfig(): void {
        LLMProvider.config = LLMProvider.loadConfig();
        logger.info(`[LLM_PROVIDER] Reloaded config: provider=${LLMProvider.config.type}, model=${LLMProvider.config.model}`);
    }

    /**
     * Returns whether a provider is configured and ready.
     */
    public static isAvailable(): boolean {
        return LLMProvider.config.type !== "none" && !!LLMProvider.config.apiKey;
    }

    /**
     * Returns the current provider configuration (masked API key).
     */
    public static getConfig(): Omit<LLMProviderConfig, "apiKey"> & { apiKey: string } {
        return {
            ...LLMProvider.config,
            apiKey: LLMProvider.config.apiKey ? `${LLMProvider.config.apiKey.substring(0, 8)}...` : "not set",
        };
    }

    /**
     * Sends a completion request to the configured LLM.
     * Falls back to a simulated response if no provider is configured.
     */
    public static async complete(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        if (!LLMProvider.isAvailable()) {
            logger.warn("[LLM_PROVIDER] No provider configured. Returning simulated response.");
            logger.info("[LLM_PROVIDER] Set ATABEY_LLM_PROVIDER and ATABEY_LLM_API_KEY to enable.");
            return LLMProvider.simulateResponse(request);
        }

        try {
            switch (LLMProvider.config.type) {
                case "openai":
                    return await LLMProvider.callOpenAI(request);
                case "anthropic":
                    return await LLMProvider.callAnthropic(request);
                case "local":
                    return await LLMProvider.callLocal(request);
                default:
                    return LLMProvider.simulateResponse(request);
            }
        } catch (err) {
            logger.error(`[LLM_PROVIDER] ${LLMProvider.config.type} call failed: ${(err as Error).message}`);
            logger.info("[LLM_PROVIDER] Falling back to simulated response.");
            return LLMProvider.simulateResponse(request);
        }
    }

    /**
     * Executes a task by sending it to the LLM as a user message.
     * The system message contains the agent's role definition.
     */
    public static async executeTask(
        agentName: string,
        agentRole: string,
        task: string,
        traceId: string
    ): Promise<string> {
        const startTime = Date.now();

        const response = await LLMProvider.complete({
            messages: [
                {
                    role: "system",
                    content: `You are ${agentName}. ${agentRole}\n\nFollow these rules:\n- Never use \`any\` type\n- Never use console.log\n- Never use mock data\n- Always use proper error handling\n- Always write tests\n- Trace ID: ${traceId}`
                },
                {
                    role: "user",
                    content: task
                }
            ],
            temperature: 0.3,
        });

        const durationMs = Date.now() - startTime;

        // Log the execution
        AtabeyStorage.saveLog({
            agent: agentName.replace("@", ""),
            action: "LLM_EXECUTION",
            trace_id: traceId,
            status: "SUCCESS",
            summary: `LLM ${LLMProvider.config.type}/${response.model} executed task in ${durationMs}ms (tokens: ${response.usage?.totalTokens || "N/A"})`
        });

        logger.info(`[LLM_PROVIDER] ${agentName} completed via ${response.model} (${durationMs}ms)`);

        return response.content;
    }

    // ─── Private API Implementations ────────────────────────────────────

    private static async callOpenAI(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        const baseUrl = LLMProvider.config.baseUrl || "https://api.openai.com/v1";
        const response = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${LLMProvider.config.apiKey}`,
            },
            body: JSON.stringify({
                model: LLMProvider.config.model,
                messages: request.messages,
                temperature: request.temperature ?? LLMProvider.config.temperature,
                max_tokens: request.maxTokens ?? LLMProvider.config.maxTokens,
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
            choices: Array<{ message: { content: string } }>;
            model: string;
            usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        return {
            content: data.choices[0]?.message?.content || "",
            model: data.model,
            usage: {
                promptTokens: data.usage?.prompt_tokens || 0,
                completionTokens: data.usage?.completion_tokens || 0,
                totalTokens: data.usage?.total_tokens || 0,
            },
        };
    }

    private static async callAnthropic(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        const baseUrl = LLMProvider.config.baseUrl || "https://api.anthropic.com/v1";

        // Convert OpenAI-style messages to Anthropic format
        const systemMsg = request.messages.find(m => m.role === "system")?.content || "";
        const userMsgs = request.messages.filter(m => m.role !== "system");

        const response = await fetch(`${baseUrl}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": LLMProvider.config.apiKey!,
                "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
                model: LLMProvider.config.model,
                system: systemMsg,
                messages: userMsgs.map(m => ({ role: m.role, content: m.content })),
                max_tokens: request.maxTokens ?? LLMProvider.config.maxTokens,
                temperature: request.temperature ?? LLMProvider.config.temperature,
            }),
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
            content: Array<{ text: string }>;
            model: string;
            usage: { input_tokens: number; output_tokens: number };
        };

        return {
            content: data.content[0]?.text || "",
            model: data.model,
            usage: {
                promptTokens: data.usage?.input_tokens || 0,
                completionTokens: data.usage?.output_tokens || 0,
                totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
            },
        };
    }

    private static async callLocal(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
        const baseUrl = LLMProvider.config.baseUrl || "http://localhost:11434"; // Ollama default
        const response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: LLMProvider.config.model,
                messages: request.messages,
                stream: false,
                options: {
                    temperature: request.temperature ?? LLMProvider.config.temperature,
                    num_predict: request.maxTokens ?? LLMProvider.config.maxTokens,
                },
            }),
        });

        if (!response.ok) {
            throw new Error(`Local API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as {
            message: { content: string };
            model: string;
        };

        return {
            content: data.message?.content || "",
            model: data.model,
        };
    }

    /**
     * Simulates an LLM response when no provider is configured.
     * Used for development/testing without API keys.
     */
    private static simulateResponse(request: LLMCompletionRequest): LLMCompletionResponse {
        const lastUserMsg = request.messages.filter(m => m.role === "user").pop();
        const taskSummary = lastUserMsg?.content.substring(0, 100) || "no task";

        const simulatedContent = `[SIMULATED ${LLMProvider.config.type.toUpperCase()} RESPONSE]
Task received: ${taskSummary}
Agent role: ${request.messages.find(m => m.role === "system")?.content?.substring(0, 80) || "general"}

This is a simulated response. To use a real LLM provider:
1. Set ATABEY_LLM_PROVIDER=openai|anthropic|local
2. Set ATABEY_LLM_API_KEY=your-api-key
3. Optionally set ATABEY_LLM_MODEL=model-name

For local models (Ollama): Ensure Ollama is running on http://localhost:11434`;

        logger.debug(`[LLM_PROVIDER] Simulated response for: ${taskSummary}`);

        return {
            content: simulatedContent,
            model: "simulated",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        };
    }
}
