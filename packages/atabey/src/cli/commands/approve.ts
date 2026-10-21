import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../utils/memory.js";
import { UI } from "../utils/ui.js";
import { writeTextFile, appendFile } from "../utils/fs.js";
import { ValidationError } from "../../shared/errors.js";

import { HermesMessageSchema } from "./orchestrate.js";
import { Storage } from "../../shared/storage.js";

export async function approveCommand(traceId: string) {
    const frameworkDir = getFrameworkDir();
    const messagesDir = path.join(frameworkDir, "messages");
    let found = false;

    // 1. Primary SSOT: Check and approve in SQLite storage
    try {
        const approval = Storage.getApproval(traceId);
        if (approval && approval.status === "PENDING") {
            Storage.updateApprovalStatus(traceId, "APPROVED");
            found = true;
            UI.success(`Approved high-risk operation for trace: ${traceId} (Tool: ${approval.toolName})`);
        }
        const pendingMessages = Storage.getPendingMessages();
        for (const msg of pendingMessages) {
            if (msg.traceId === traceId && (msg.category === "ALERT" || msg.category === "ACTION") && msg.id !== undefined) {
                Storage.updateMessageStatus(msg.id, "APPROVED");
                found = true;
                UI.success(`Approved message from ${msg.from} to ${msg.to} (Action: ${msg.category})`);
            }
        }
    } catch {
        // Storage may not be initialized in non-DB environments
    }

    // 2. Secondary / Legacy: Check flat message files if present
    if (fs.existsSync(messagesDir)) {
        const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith(".json"));

    for (const file of files) {
        const filePath = path.join(messagesDir, file);
        try {
            const content = fs.readFileSync(filePath, "utf8").trim();
            if (!content) continue;
            const lines = content.split("\n");
            let updated = false;
            const newLines = lines.map((line) => {
                if (!line.trim()) return line;
                try {
                    const parsed = JSON.parse(line);
                    const msg = HermesMessageSchema.parse(parsed);
                    if (msg.traceId === traceId && msg.status === "PENDING" && (msg.category === "ALERT" || msg.category === "ACTION")) {
                        msg.status = "APPROVED";
                        updated = true;
                        found = true;
                        UI.success(`Approved message from ${msg.from} to ${msg.to} (Action: ${msg.action || "None"})`);
                    }
                    return JSON.stringify(msg);
                } catch (e) {
                    UI.error(`Skipping invalid Hermes message during approval: ${(e as Error).message}`);
                    return line;
                }
            });

            if (updated) {
                writeTextFile(filePath, newLines.join("\n") + "\n");
            }
        } catch (e) {
            UI.error(`Error reading or updating message file ${file}: ${(e as Error).message}`);
        }
    }
    }

    if (found) {
        // Log user approval to audit log
        const auditPath = path.join(frameworkDir, "observability/audit_log.md");
        if (fs.existsSync(auditPath)) {
            const logEntry = "\n- **[" + new Date().toISOString() + "]** USER -> @manager | APPROVED | Trace: " + traceId;
            appendFile(auditPath, logEntry);
        }
        UI.success("Successfully approved Trace: " + traceId);
    } else {
        throw new ValidationError(
            `No pending approval request found for Trace ID: ${traceId}`,
            null,
            "Run 'npx atabey status' to see active traces and ensure the ID is correct and pending approval."
        );
    }
}
