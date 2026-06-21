import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "../../utils/security.js";
import { SendAgentMessageArgs, ToolResult } from "../types.js";
import { Metrics } from "../../utils/metrics.js";
import { verifyMessagingPermission, resolveActiveAgent } from "../../utils/permissions.js";

export async function handleSendAgentMessage(projectRoot: string, args: SendAgentMessageArgs): Promise<ToolResult> {
    const { to, category, content, traceId, parentId, requiresApproval } = args;
    
    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir)
        ? frameworkDir
        : path.resolve(projectRoot, frameworkDir);
    const activeAgent = resolveActiveAgent(absoluteFrameworkPath);
    const from = activeAgent || args.from || "@mcp";

    if (!to || !category || !content || !traceId) {
        const err = "Missing required messaging arguments (to, category, content, or traceId).";
        Metrics.logError(projectRoot, from, "send_agent_message", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    // ENFORCE AGENT TIER MESSAGING RBAC
    // Prevents core agents from delegating to recon agents, bypassing the quality gate.
    // This is the AI Governance enforcement point for Claude Code, Gemini CLI, Cursor.
    try {
        verifyMessagingPermission(from, to);
    } catch (e) {
        const err = String(e instanceof Error ? e.message : e);
        Metrics.logError(projectRoot, from, "send_agent_message", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    const messagesDir = path.join(projectRoot, frameworkDir, "messages");
    const agentName = to.replace("@", "");
    const messagePath = path.join(messagesDir, `${agentName}.json`);
    const lockPath = path.join(messagesDir, `${agentName}.lock`);

    // Hermes Lock Protocol: Retry 20 times with 500ms delay
    let retries = 20;
    let acquired = false;
    while (retries > 0) {
        try {
            if (fs.existsSync(lockPath)) {
                try {
                    const stats = fs.statSync(lockPath);
                    if (Date.now() - stats.mtimeMs > 15000) {
                        const tempLockPath = `${lockPath}.${Math.random().toString(36).substring(2)}.old`;
                        fs.renameSync(lockPath, tempLockPath);
                        fs.unlinkSync(tempLockPath);
                    }
                } catch {
                    // ignore if concurrently unlinked or renamed
                }
            }
            fs.mkdirSync(messagesDir, { recursive: true });
            fs.writeFileSync(lockPath, `Locked by ${from} at ${new Date().toISOString()}`, { flag: "wx" });
            acquired = true;
            break;
        } catch (err: unknown) {
            const error = err as { code?: string; message?: string };
            if (error.code === "EEXIST") {
                retries--;
                if (retries > 0) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            } else {
                return { content: [{ type: "text", text: `[ERROR] Unexpected lock acquisition error: ${error.message || String(err)}` }], isError: true };
            }
        }
    }

    if (!acquired) {
        const err = `Could not send message to ${to}: Hermes lock is busy.`;
        Metrics.logError(projectRoot, from, "send_agent_message", err);
        return { content: [{ type: "text", text: `[ERROR] ${err}` }], isError: true };
    }

    try {
        const defaultPriority = (category === "ALERT" || category === "ACTION") ? "HIGH" : "NORMAL";
        const finalRequiresApproval = requiresApproval !== undefined
            ? requiresApproval
            : category === "ALERT";

        const message = {
            timestamp: new Date().toISOString(),
            from,
            to,
            category,
            traceId,
            parentId,
            content,
            priority: args.priority || defaultPriority,
            status: "PENDING",
            requiresApproval: finalRequiresApproval
        };

        fs.appendFileSync(messagePath, JSON.stringify(message) + "\n");
        return { content: [{ type: "text", text: `[OK] Message sent to ${to} (from: ${from})` }] };
    } catch (e) {
        const err = `Failed to write message: ${String(e)}`;
        Metrics.logError(projectRoot, from, "send_agent_message", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    } finally {
        if (acquired && fs.existsSync(lockPath)) {
            try {
                fs.unlinkSync(lockPath);
            } catch {
                // ignore
            }
        }
    }
}
