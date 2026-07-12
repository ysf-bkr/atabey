import fs from "fs";
import { verifyCorporateCompliance, verifyRiskAndAwaitApproval } from "atabey-mcp/utils/compliance.js";
import { writeProjectFile } from "atabey-mcp/utils/file-lock-guard.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { verifyWritePermission } from "atabey-mcp/utils/permissions.js";
import { safePath } from "atabey-mcp/utils/security.js";
import { BatchSurgicalEditArgs, ToolResult } from "../types.js";

interface SurgicalEdit {
    path: string;
    oldText: string;
    newText: string;
    allowMultiple?: boolean;
}

/**
 * Performs multiple surgical text replacements across multiple files in a single batch.
 */
export async function handleBatchSurgicalEdit(projectRoot: string, args: BatchSurgicalEditArgs): Promise<ToolResult> {
    const edits = args.edits as SurgicalEdit[];
    if (!Array.isArray(edits) || edits.length === 0) {
        const err = "No edits provided in the batch request.";
        Metrics.logError(projectRoot, "@mcp", "batch_surgical_edit", err);
        throw new Error(err);
    }

    const results: string[] = [];
    let totalTokens = 0;

    for (const edit of edits) {
        const filePath = safePath(projectRoot, edit.path);

        // ENFORCE PERMISSION MATRIX
        verifyWritePermission(projectRoot, edit.path);

        if (!fs.existsSync(filePath)) {
            const err = `File not found: ${edit.path}`;
            Metrics.logError(projectRoot, "@mcp", `batch_surgical_edit:${edit.path}`, err);
            throw new Error(err);
        }

        const content = fs.readFileSync(filePath, "utf8");
        const { oldText, newText, allowMultiple = false } = edit;

        if (!content.includes(oldText)) {
            const err = `Text not found in file ${edit.path}`;
            Metrics.logError(projectRoot, "@mcp", `batch_surgical_edit:${edit.path}`, err);
            throw new Error(err);
        }

        // Surgical precision guard
        if (!allowMultiple) {
            const firstIndex = content.indexOf(oldText);
            const lastIndex = content.lastIndexOf(oldText);
            if (firstIndex !== lastIndex) {
                const err = `Ambiguous replacement in ${edit.path}`;
                Metrics.logError(projectRoot, "@mcp", `batch_surgical_edit:${edit.path}`, err);
                throw new Error(err);
            }
        }

        const newContent = allowMultiple
            ? content.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), newText)
            : content.replace(oldText, newText);

        // ENFORCE CORPORATE COMPLIANCE
        verifyCorporateCompliance(newContent, edit.path);

        // ENFORCE RISK & HUMAN APPROVAL GATEWAY
        await verifyRiskAndAwaitApproval(projectRoot, newContent, edit.path);

        const toWrite = newContent.endsWith("\n") ? newContent : `${newContent}\n`;
        await writeProjectFile(projectRoot, edit.path, toWrite);

        const tokens = Metrics.estimateTokens(newText);
        totalTokens += tokens;
        results.push(`[OK] Edited ${edit.path}`);
    }

    Metrics.logUsage(projectRoot, "@mcp", `batch_surgical_edit: ${edits.length} files`, totalTokens);

    return {
        content: [{
            type: "text",
            text: `Successfully performed ${edits.length} edits:\n${results.join("\n")}`
        }]
    };
}
