import fs from "fs";
import path from "path";
import { ToolResult, AcquireLockArgs, ReleaseLockArgs } from "../types.js";
import { resolveFrameworkDir } from "atabey-mcp/utils/security.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";

/**
 * Handles acquiring a stateful lock on a resource with Deadlock Resolution.
 */
export async function handleAcquireLock(projectRoot: string, args: AcquireLockArgs): Promise<ToolResult> {
    const { resource, agent, ttl = 300 } = args; // Default TTL 5 minutes to prevent deadlocks
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const lockDir = path.join(projectRoot, frameworkDir, "locks");
    const lockPath = path.join(lockDir, `${resource}.lock`);

    try {
        if (!fs.existsSync(lockDir)) fs.mkdirSync(lockDir, { recursive: true });

        // Check for stale lock first (DEADLOCK RESOLUTION)
        if (fs.existsSync(lockPath)) {
            const stat = fs.statSync(lockPath);
            const now = new Date().getTime();
            const age = (now - stat.mtimeMs) / 1000;

            if (age < ttl) {
                return {
                    isError: true,
                    content: [{ type: "text", text: `[LOCKED] Resource '${resource}' is currently locked by another agent. Try again later.` }]
                };
            }
            
            // Lock expired: Force Eviction
            const oldLockData = JSON.parse(fs.readFileSync(lockPath, "utf8"));
            Metrics.logError(projectRoot, "@mcp", "lock_eviction", `Forcefully evicted stale lock on '${resource}' held by ${oldLockData.agent} for ${Math.round(age)}s.`);
            
            const tempLockPath = `${lockPath}.${Math.random().toString(36).substring(2)}.old`;
            try {
                fs.renameSync(lockPath, tempLockPath);
                fs.unlinkSync(tempLockPath);
            } catch {
                // Ignore if already evicted by race condition
            }
        }

        // Use 'wx' flag for atomic file creation
        const lockData = JSON.stringify({ agent, timestamp: new Date().toISOString() });
        fs.writeFileSync(lockPath, lockData, { flag: "wx" });
        
        return {
            content: [{ type: "text", text: `[OK] Lock acquired for resource '${resource}' by ${agent}.` }]
        };
    } catch (e) {
        const error = e as { code?: string };
        if (error.code === "EEXIST") {
            return {
                isError: true,
                content: [{ type: "text", text: `[LOCKED] Resource '${resource}' was just acquired by another agent.` }]
            };
        }
        return {
            isError: true,
            content: [{ type: "text", text: `Failed to acquire lock: ${String(e)}` }]
        };
    }
}


/**
 * Handles releasing a lock.
 */
export async function handleReleaseLock(projectRoot: string, args: ReleaseLockArgs): Promise<ToolResult> {
    const { resource, agent } = args;
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const lockPath = path.join(projectRoot, frameworkDir, "locks", `${resource}.lock`);

    try {
        if (!fs.existsSync(lockPath)) {
            return { content: [{ type: "text", text: `[INFO] No lock found for resource '${resource}'.` }] };
        }

        const lockData = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        if (lockData.agent !== agent) {
            return {
                isError: true,
                content: [{ type: "text", text: `[ERROR] Denied: You do not own the lock for '${resource}'. Owned by ${lockData.agent}.` }]
            };
        }

        fs.unlinkSync(lockPath);
        return { content: [{ type: "text", text: `[OK] Lock released for resource '${resource}' by ${agent}.` }] };
    } catch (e) {
        return { isError: true, content: [{ type: "text", text: `Failed to release lock: ${String(e)}` }] };
    }
}
