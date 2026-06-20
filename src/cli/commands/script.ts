import cp from "child_process";
import fs from "fs";
import path from "path";
import { UI } from "../utils/ui.js";

const targetDir = process.cwd();

export async function runScriptCommand(script: string, projectPath: string) {
    const fullPath = path.join(targetDir, projectPath);
    if (!fs.existsSync(fullPath)) {
        UI.error(`Project path not found: ${projectPath}`);
        return;
    }
    UI.info(`Running 'npm run ${script}' in ${projectPath}...`);
    try {
        cp.spawnSync("npm", ["run", script], { cwd: fullPath, stdio: "inherit", shell: true });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        UI.error(`Failed to run script: ${message}`);
    }
}
