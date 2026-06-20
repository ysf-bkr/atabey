import fs from "fs";
import path from "path";
import { writeTextFile } from "../../../shared/fs.js";
import { UI } from "../../utils/ui.js";

/**
 * Plugin SDK: Creates a new custom agent template.
 */
export async function createAgentCommand(name: string) {
    const projectRoot = process.cwd();
    const agentsDir = path.join(projectRoot, "src/modules/agents/registry");

    if (!fs.existsSync(agentsDir)) {
        UI.error("Agent registry directory not found. Please ensure you are in an Atabey development environment.");
        return;
    }

    const filePath = path.join(agentsDir, `${name}.ts`);
    if (fs.existsSync(filePath)) {
        UI.error(`Agent '${name}' already exists.`);
        return;
    }

    const template = `import { AgentDefinition } from "../types.js";

const STATE_MACHINE = "../schema/agent-lifecycle-schema.json" as const;

export const ${name}: AgentDefinition = {
    name: "${name}",
    displayName: "${name.charAt(0).toUpperCase() + name.slice(1)} Specialist",
    role: "Custom Specialty",
    description: "Automatically generated custom agent for specific project needs.",
    capability: 7,
    tier: "core",
    tags: ["custom"],
    stateMachine: STATE_MACHINE,
    tools: [
        "read_file",
        "write_file",
        "replace_text",
        "grep_search",
        "send_agent_message",
    ],
    instructions: {
        identity: "${name.toUpperCase()} Domain Expert",
        mission: "Execute tasks related to ${name} with high precision and following Atabey standards.",
        chainOfThought: "1. Analyze Task\\n2. Plan Steps\\n3. Execute\\n4. Verify",
        rules: [
            "Always maintain type safety.",
            "Log all critical actions.",
        ],
        knowledgeFiles: [],
    },
    specialties: {
        ${name}: 10,
    },
};
`;

    writeTextFile(filePath, template);
    UI.success(`[OK] New agent '${name}' created at src/modules/agents/registry/${name}.ts`);
    UI.warning("[INFO] Don't forget to register the agent in src/modules/agents/definitions.ts");
}
