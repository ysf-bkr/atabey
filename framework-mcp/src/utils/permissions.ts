import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "./security.js";

export interface PermissionMatrix {
    [agent: string]: {
        write: string[];
        read?: string[];
    };
}

function globToRegex(glob: string): RegExp {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    const step1 = escaped.replace(/\*\*/g, "__DBL_STR__");
    const step2 = step1.replace(/\*/g, "[^/]*");
    const regexStr = "^" + step2.replace(/__DBL_STR__/g, ".*") + "$";
    return new RegExp(regexStr);
}

/**
 * Validates if the active agent has write permission for the target file.
 * Automatically identifies the active agent by checking the status.json store
 * for the agent in the "EXECUTING" state.
 */
export function verifyWritePermission(projectRoot: string, targetFilePath: string): void {
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir) 
        ? frameworkDir 
        : path.resolve(projectRoot, frameworkDir);

    const matrixPath = path.join(absoluteFrameworkPath, "permission-matrix.json");

    // If no permission matrix exists, skip enforcement (default allow)
    if (!fs.existsSync(matrixPath)) {
        return;
    }

    let matrix: PermissionMatrix;
    try {
        matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
    } catch (e) {
        throw new Error(`Failed to parse permission-matrix.json: ${String(e)}`, { cause: e });
    }

    // Determine the active agent from status.json
    const statusPath = path.join(absoluteFrameworkPath, "memory", "status.json");
    let activeAgent: string | null = null;

    if (fs.existsSync(statusPath)) {
        try {
            const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
            // Find an agent that is currently in the EXECUTING state
            for (const [agentName, info] of Object.entries(status)) {
                const data = info as { state: string };
                if (data.state === "EXECUTING") {
                    activeAgent = agentName.startsWith("@") ? agentName : `@${agentName}`;
                    break;
                }
            }
        } catch (e) {
            // Log warning but don't crash, default to allowing if status can't be parsed
            process.stderr.write(`[Permissions] Warning: Failed to read status.json: ${String(e)}\n`);
        }
    }

    // If no active executing agent is found, default to allowing
    if (!activeAgent) {
        return;
    }

    const agentRules = matrix[activeAgent];
    // If no rules defined for the agent, default to allowing
    if (!agentRules || !agentRules.write) {
        return;
    }

    // Resolve target path relative to project root for glob matching
    const relativeTargetPath = path.relative(projectRoot, path.resolve(projectRoot, targetFilePath));

    const allowed = agentRules.write.some(glob => {
        const regex = globToRegex(glob);
        return regex.test(relativeTargetPath);
    });

    if (!allowed) {
        throw new Error(`Permission Denied: Agent ${activeAgent} is not authorized to write to "${relativeTargetPath}". Matrix rules restrict writes to: [${agentRules.write.join(", ")}].`);
    }
}
