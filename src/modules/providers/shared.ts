import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";
import { writeJsonFile, writeTextFile } from "../../shared/fs.js";
import { ALL_AGENTS, toAntigravityJson } from "../agents/definitions.js";
import { CORE_SKILLS } from "../skills/definitions.js";
import { getPackageRoot } from "../../cli/utils/pkg.js";
import { logger } from "../../shared/logger.js";

export function registerGlobalAntigravityPlugins(mcpBlock: unknown): void {
    // Allow overriding via env var for different OS/Gemini CLI versions
    const defaultGlobalDir = path.join(os.homedir(), ".gemini/antigravity-cli");
    const customDir = process.env["ANTIGRAVITY_GLOBAL_DIR"];
    const targets = [customDir ?? defaultGlobalDir];
    const baseKnowledgeDir = path.join(getPackageRoot(), "templates/standards");

    for (const globalDir of targets) {
        try {
            // Write directly under directory
            fs.mkdirSync(globalDir, { recursive: true });
            writeJsonFile(path.join(globalDir, "mcp.json"), mcpBlock);
            writeJsonFile(path.join(globalDir, "mcp_config.json"), mcpBlock);
            logger.info(`Antigravity MCP registered → ${globalDir}/`);

            // Global Plugin configuration under plugins/atabey/
            const globalPluginDir = path.join(globalDir, "plugins/atabey");
            fs.mkdirSync(globalPluginDir, { recursive: true });

            // plugin.json marker
            writeJsonFile(path.join(globalPluginDir, "plugin.json"), {
                name: "atabey",
                version: "1.0.0",
                description: "Agent Atabey AI Orchestration framework"
            });

            // MCP Server configs inside the plugin
            writeJsonFile(path.join(globalPluginDir, "mcp.json"), mcpBlock);
            writeJsonFile(path.join(globalPluginDir, "mcp_config.json"), mcpBlock);

            // Scaffold 13 agents
            const agentsBaseDir = path.join(globalPluginDir, "agents");
            fs.mkdirSync(agentsBaseDir, { recursive: true });

            // Also write directly to ~/.gemini/antigravity-cli/agents/ so the CLI's
            // workspace/global agent discovery finds them without the plugins/ prefix.
            const globalAgentsDir = path.join(globalDir, "agents");
            fs.mkdirSync(globalAgentsDir, { recursive: true });

            for (const ag of ALL_AGENTS) {
                const agentJson = toAntigravityJson(ag, baseKnowledgeDir);

                // 1. Nested format inside plugin: plugins/atabey/agents/{name}/agent.json
                const nestedAgentDir = path.join(agentsBaseDir, ag.name);
                fs.mkdirSync(nestedAgentDir, { recursive: true });
                writeTextFile(path.join(nestedAgentDir, "agent.json"), agentJson);

                // 2. Flat format inside plugin: plugins/atabey/agents/{name}.json
                writeTextFile(path.join(agentsBaseDir, `${ag.name}.json`), agentJson);

                // 3. Direct global agents root — THIS is what Antigravity CLI reads:
                //    ~/.gemini/antigravity-cli/agents/{name}/agent.json
                const globalNestedDir = path.join(globalAgentsDir, ag.name);
                fs.mkdirSync(globalNestedDir, { recursive: true });
                writeTextFile(path.join(globalNestedDir, "agent.json"), agentJson);

                // 4. Flat global format as fallback
                writeTextFile(path.join(globalAgentsDir, `${ag.name}.json`), agentJson);
            }

            // Scaffold skills
            const skillsDir = path.join(globalPluginDir, "skills");
            fs.mkdirSync(skillsDir, { recursive: true });
            for (const [key, skill] of Object.entries(CORE_SKILLS)) {
                const skillContent = `# [TOOL] Skill — ${skill.name}\n\n${skill.mandates.join("\n")}\n`;
                writeTextFile(path.join(skillsDir, `${key.toLowerCase()}.md`), skillContent);
            }

            // Scaffold rules
            const rulesDir = path.join(globalPluginDir, "rules");
            fs.mkdirSync(rulesDir, { recursive: true });
            for (const ag of ALL_AGENTS) {
                const ruleContent = `# [ATABEY] Agent Atabey — @${ag.name} (${ag.displayName})

You are the **${ag.displayName}** of the Agent Atabey AL.

## [AI] Specialist Directive (Role: @${ag.name})
${ag.instructions.identity}

### [GOAL] Mission
${ag.instructions.mission}

### [DOCS] Discipline Rules
${ag.instructions.rules.map(r => `- ${r}`).join("\n")}

## [SECURITY] Core Mandates
- **Surgical Precision:** Enforce replace_text / replace_file_content for all code modifications.
- **Traceability:** Inherit and pass the active Trace ID across all delegations.
- **Approval Signature:** High-risk actions require manager approval signature.
`;
                writeTextFile(path.join(rulesDir, `${ag.name}.md`), ruleContent);
            }

            // Scaffold optional empty hooks.json
            writeJsonFile(path.join(globalPluginDir, "hooks.json"), {});

            logger.info(`Antigravity Plugin registered → ${globalPluginDir}/`);

            try {
                execSync(`agy plugin install "${globalPluginDir}"`, { stdio: "ignore" });
                logger.info("Antigravity Plugin installed in CLI.");
            } catch {
                // Ignore if agy is not in PATH or fails
            }

        } catch (e) {
            logger.warn(`Failed to register plugin/MCP in ${globalDir}`, e);
        }
    }
}
