import fs from "fs";
import { writeTextFile } from "atabey-mcp/utils/fs.js";
import { Metrics } from "atabey-mcp/utils/metrics.js";
import { safePath } from "atabey-mcp/utils/security.js";
import { ReplaceTextArgs, ToolResult } from "../types.js";

import { verifyCorporateCompliance, verifyRiskAndAwaitApproval } from "atabey-mcp/utils/compliance.js";
import { verifyWritePermission } from "atabey-mcp/utils/permissions.js";

export async function handleReplaceText(projectRoot: string, args: ReplaceTextArgs): Promise<ToolResult> {
    const filePath = safePath(projectRoot, args.path);

    // ENFORCE PERMISSION MATRIX
    verifyWritePermission(projectRoot, args.path);
    const content = fs.readFileSync(filePath, "utf8");
    const oldText = args.oldText;
    const newText = args.newText;
    const allowMultiple = args.allowMultiple || false; // Default to false

    if (!content.includes(oldText)) {
        const err = `Text not found in file: ${oldText.slice(0, 100)}...`;
        Metrics.logError(projectRoot, "@mcp", `replace_text:${args.path}`, err);
        throw new Error(err);
    }

    // Surgical precision guard: reject ambiguous replacements unless allowMultiple is true.
    if (!allowMultiple) {
        const firstIndex = content.indexOf(oldText);
        const lastIndex = content.lastIndexOf(oldText);
        if (firstIndex !== lastIndex) {
            const count = (content.match(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
            const err = `Ambiguous replacement: "${oldText.slice(0, 80)}..." found ${count} times in ${args.path}. ` +
                        "Provide a longer, unique context string or set 'allow_multiple' to true.";
            Metrics.logError(projectRoot, "@mcp", `replace_text:${args.path}`, err);
            throw new Error(err);
        }
    }

    // Perform replacement(s).
    // Use a function replacer so special patterns ($&, $1, $$) inside newText
    // are treated literally and never reinterpreted as regex backreferences.
    let newContent: string;
    if (allowMultiple) {
        newContent = content.replace(new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), () => newText);
    } else {
        newContent = content.replace(oldText, () => newText);
    }

    // ENFORCE CORPORATE COMPLIANCE
    verifyCorporateCompliance(newContent, args.path as string);

    // ENFORCE RISK & HUMAN APPROVAL GATEWAY
    await verifyRiskAndAwaitApproval(projectRoot, newContent, args.path);

    writeTextFile(filePath, newContent);

    const tokens = Metrics.estimateTokens(newText);
    Metrics.logUsage(projectRoot, "@mcp", `replace_text: ${args.path}`, tokens);

    return { content: [{ type: "text", text: `[OK] Surgical edit successful in ${args.path}` }] };
}
