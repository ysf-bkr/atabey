import cp from "child_process";
import fs from "fs";
import path from "path";
import { UI } from "../utils/ui.js";

const targetDir = process.cwd();

export async function runScriptCommand(script: string, projectPath: string) {
    if (!script || typeof script !== "string") {
        UI.error("Usage: atabey script <name> [dir] — a script name is required.");
        return;
    }
    const fullPath = path.join(targetDir, projectPath);
    if (!fs.existsSync(fullPath)) {
        UI.error(`Project path not found: ${projectPath}`);
        return;
    }
    UI.info(`Running 'npm run ${script}' in ${projectPath}...`);
    try {
        // shell: false prevents shell injection attacks
        // script name is validated (no spaces, no special chars)
        const sanitizedScript = script.replace(/[^a-zA-Z0-9_-]/g, "");
        if (sanitizedScript !== script) {
            UI.error(`Invalid script name: "${script}". Use only letters, numbers, hyphens, and underscores.`);
            return;
        }
        const result = cp.spawnSync("npm", ["run", sanitizedScript], { cwd: fullPath, stdio: "inherit", shell: false });
        if (result.error) {
            UI.error(`Failed to run script: ${result.error.message}`);
            process.exit(1);
        }
        if (result.status !== 0) {
            process.exit(result.status ?? 1);
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        UI.error(`Failed to run script: ${message}`);
    }
}
