import fs from "fs";
import path from "path";
import {
    ALL_AGENTS,
    toAntigravityJson,
    toClaudeCodeMd,
    toCodexMd,
    toCursorMdc,
    toGeminiCliMd
} from "../../modules/agents/definitions.js";
import { writeTextFile } from "../utils/fs.js";
import { getPackageRoot } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

import type { AdapterId } from "../../modules/providers/types.js";
import { ADAPTERS } from "./core.js";

export function scaffoldAgents(
    projectRoot: string,
    adapterId: AdapterId,
    dryRun: boolean,
    agentsToScaffold?: string[],
    explicitDestDir?: string,
    explicitExt?: string,
    paths?: Record<string, string>,
    backendLanguage?: string,
    _language?: string
): void {
    const adapter = ADAPTERS[adapterId];
    if (!adapter) return;

    const allowedAgents = agentsToScaffold ? new Set(agentsToScaffold) : undefined;
    const destAgentsDir = explicitDestDir ? path.join(projectRoot, explicitDestDir) : (adapter.agentsDir ? path.join(projectRoot, adapter.agentsDir) : null);
    const extension = explicitExt || adapter.agentsExt || ".md";

    if (!destAgentsDir) return;

    const baseKnowledgeDir = path.join(getPackageRoot(), "templates/standards");

    try {
        if (!dryRun) fs.mkdirSync(destAgentsDir, { recursive: true });

        for (const agent of ALL_AGENTS) {
            if (allowedAgents && !allowedAgents.has(agent.name)) continue;

            let content = "";
            let fileName = `${agent.name}${extension}`;
            let secondaryContent: string | null = null;
            let secondaryFileName: string | null = null;

            switch (adapterId) {
                case "gemini":
                    content = toGeminiCliMd(agent, baseKnowledgeDir, paths, backendLanguage);
                    break;
                case "grok":
                    // Grok uses same Gemini-compatible YAML format
                    content = toGeminiCliMd(agent, baseKnowledgeDir, paths, backendLanguage);
                    break;
                case "claude":
                    content = toClaudeCodeMd(agent, baseKnowledgeDir, paths, backendLanguage);
                    break;
                case "cursor":
                    content = toCursorMdc(agent, baseKnowledgeDir, paths, backendLanguage);
                    break;
                case "codex":
                    content = toCodexMd(agent, baseKnowledgeDir, paths, backendLanguage);
                    break;
                case "antigravity-cli": {
                    // Antigravity uses nested folders: agents/{name}/agent.json and agents/{name}/agent.md
                    const agentDir = path.join(destAgentsDir, agent.name);
                    if (!dryRun) fs.mkdirSync(agentDir, { recursive: true });

                    content = toAntigravityJson(agent, baseKnowledgeDir, paths, backendLanguage);
                    fileName = path.join(agent.name, "agent.json");

                    secondaryContent = `# [ATABEY] Agent Atabey — @${agent.name}\n\n${agent.instructions.identity}\n\n${agent.instructions.mission}`;
                    secondaryFileName = path.join(agent.name, "agent.md");
                    break;
                }
                default:
                    // Fallback to Gemini format
                    content = toGeminiCliMd(agent, baseKnowledgeDir, paths, backendLanguage);
                    break;
            }

            if (!dryRun) {
                writeTextFile(path.join(destAgentsDir, fileName), content, dryRun);
                if (secondaryContent && secondaryFileName) {
                    writeTextFile(path.join(destAgentsDir, secondaryFileName), secondaryContent, dryRun);
                }
            }
        }
    } catch (e) {
        UI.warning(`  Failed to scaffold agents for ${adapterId}: ${e}`);
    }
}
