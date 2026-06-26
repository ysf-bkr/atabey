import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { UI } from "../utils/ui.js";

import type { AdapterConfig, AdapterId } from "../../modules/providers/types.js";
import { ADAPTERS, SHIM_FILES } from "./core.js";

export function resolveAdapter(input?: string): AdapterConfig {
    let normalized = (input || "gemini").toLowerCase();
    if (normalized === "antigravity") {
        normalized = "antigravity-cli";
    } else if (normalized === "copilot" || normalized === "github") {
        normalized = "codex";
    }

    let config: AdapterConfig;
    if (normalized in ADAPTERS) {
        config = { ...ADAPTERS[normalized as AdapterId] };
    } else {
        UI.warning(`Unknown adapter "${input}". Falling back to gemini.`);
        config = { ...ADAPTERS.gemini };
    }

    return config;
}

export function isAdapterShimFile(fileName: string): boolean {
    return SHIM_FILES.includes(fileName);
}

export function remapFrameworkContent(
    content: string,
    frameworkDir: string,
    adapterId: AdapterId,
): string {
    let result = content;

    result = result.replace(/\{\{FRAMEWORK_DIR\}\}/g, frameworkDir);
    result = result.replace(/\{\{ADAPTER\}\}/g, adapterId);

    let agentFolder = "agents";
    let knowledgeFolder = "knowledge";

    if (frameworkDir !== ".atabey") {
        if (adapterId === "antigravity-cli") {
            agentFolder = "agents";
            knowledgeFolder = "rules";
        }
        // Note: Grok uses the same directory structure as Gemini (".grok/agents").
        // No override needed — default agentFolder = "agents" is correct.
    }

    const frameworkPattern = ".atabey/";
    result = result.replace(new RegExp(frameworkPattern + "agents/", "g"), `${frameworkDir}/${agentFolder}/`);
    result = result.replace(new RegExp(frameworkPattern + "knowledge/", "g"), `${frameworkDir}/${knowledgeFolder}/`);

    result = result.replace(/\.atabey\//g, `${frameworkDir}/`);
    result = result.replace(/`\.atabey`/g, `\`${frameworkDir}\``);
    result = result.replace(/\.atabey(?![\w/-])/g, frameworkDir);

    let backend = "apps/backend";
    let frontend = "apps/web";
    let docs = "docs";
    let tests = "tests";
    try {
        const configPath = path.join(process.cwd(), frameworkDir, "config.json");
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            if (config.paths) {
                if (config.paths.backend) backend = config.paths.backend;
                if (config.paths.frontend) frontend = config.paths.frontend;
                if (config.paths.docs) docs = config.paths.docs;
                if (config.paths.tests) tests = config.paths.tests;
            }
        }
    } catch (err) {
        logger.debug("Failed to read config.json in remapFrameworkContent", err);
    }

    result = result.replace(/\{\{BACKEND_DIR\}\}/g, backend);
    result = result.replace(/\{\{FRONTEND_DIR\}\}/g, frontend);
    result = result.replace(/\{\{DOCS_DIR\}\}/g, docs);
    result = result.replace(/\{\{TESTS_DIR\}\}/g, tests);

    return result;
}
