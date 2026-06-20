import { AdapterId, AdapterConfig } from "./types.js";

type PostInitHandler = (projectRoot: string, mcpBlock: unknown) => void;

class AdapterRegistry {
    private configs: Map<string, AdapterConfig> = new Map();
    private handlers: Map<string, PostInitHandler> = new Map();

    register(config: AdapterConfig, handler: PostInitHandler) {
        this.configs.set(config.id, config);
        this.handlers.set(config.id, handler);
    }

    getConfigs(): Record<string, AdapterConfig> {
        return Object.fromEntries(this.configs);
    }

    getHandlers(): Record<string, PostInitHandler> {
        return Object.fromEntries(this.handlers);
    }

    getIds(): AdapterId[] {
        return Array.from(this.configs.keys()) as AdapterId[];
    }
}

export const registry = new AdapterRegistry();
