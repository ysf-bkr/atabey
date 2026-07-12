import fs from "fs";
import path from "path";
import { appendFile } from "atabey-mcp/utils/fs.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { resolveFrameworkDir, safePath } from "atabey-mcp/utils/security.js";
import { ToolResult, WriteFileArgs } from "../types.js";

import { verifyCorporateCompliance, verifyRiskAndAwaitApproval } from "atabey-mcp/utils/compliance.js";
import { writeProjectFile } from "atabey-mcp/utils/file-lock-guard.js";
import { verifyWritePermission } from "atabey-mcp/utils/permissions.js";

export async function handleWriteFile(projectRoot: string, args: WriteFileArgs): Promise<ToolResult> {
    if (!args.path || args.content === undefined) {
        const err = "Missing 'path' or 'content' argument.";
        Metrics.logError(projectRoot, "@mcp", "write_file", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    try {
        const filePath = safePath(projectRoot, args.path);

        // ENFORCE TOKEN ECONOMY: Prevent full-file rewrites of existing files
        if (fs.existsSync(filePath)) {
            const errMsg = `[TOKEN ECONOMY GUARD] The file '${args.path}' already exists. Overwriting entire existing files is FORBIDDEN to save tokens and prevent context drift. You MUST use 'patch_file' or 'replace_text' tools to make surgical edits.`;
            Metrics.logError(projectRoot, "@mcp", `write_file: ${args.path} (blocked)`, errMsg);
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `[ERROR] ${errMsg}`
                }]
            };
        }

        // Preserve historical write_file semantics: ensure trailing newline
        const content = args.content.endsWith("\n") ? args.content : `${args.content}\n`;

        // ENFORCE PERMISSION MATRIX
        verifyWritePermission(projectRoot, args.path);

        // ENFORCE CORPORATE COMPLIANCE
        verifyCorporateCompliance(content, args.path);

        // ENFORCE RISK & HUMAN APPROVAL GATEWAY
        await verifyRiskAndAwaitApproval(projectRoot, content, args.path);

        // Phase 1.2: sandboxed write (container/uid/host) + exclusive lock try/finally
        // filePath already validated by safePath for project-root confinement
        await writeProjectFile(projectRoot, args.path, content);

        // AUTO-LOGGING & METRICS
        const tokens = Metrics.estimateTokens(content);
        Metrics.logUsage(projectRoot, "@mcp", `write_file: ${args.path}`, tokens);

        try {
            const frameworkDir = resolveFrameworkDir(projectRoot);
            const memoryPath = path.join(projectRoot, frameworkDir, "memory/PROJECT_MEMORY.md");
            if (fs.existsSync(memoryPath)) {
                const entry = `\n### ${new Date().toISOString().split("T")[0]} — Auto-Update\n- **Action:** wrote file \`${args.path}\` (${tokens} tokens estimated).\n`;
                appendFile(memoryPath, entry);
            }
        } catch { /* ignore memory logging errors */ }

        return { content: [{ type: "text", text: `[OK] File written: ${args.path}` }] };
    } catch (e) {
        const err = `Failed to write file: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", `write_file:${args.path}`, err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }
}
