import { classifyData, containsPII, maskObject, maskText } from "../../../../src/shared/pii.js";
import { ToolResult } from "../types.js";

/**
 * ─── MASK_PII TOOL ────────────────────────────────────────────────
 *
 * Masks Personally Identifiable Information (PII) in text or structured data.
 * Compliant with KVKK (Law No. 6698) and GDPR.
 *
 * This tool can be used manually by users or AI to sanitize data
 * before sending it to external services or logging.
 */

export interface MaskPIIArgs {
    text?: string;
    data?: Record<string, unknown>;
    mode?: "text" | "object" | "auto";
    strictMode?: boolean;
}

export function handleMaskPII(root: string, args: MaskPIIArgs): ToolResult {
    const mode = args.mode || "auto";
    const strictMode = args.strictMode ?? false;

    // Mode: text
    if (mode === "text" || (mode === "auto" && args.text && !args.data)) {
        if (!args.text) {
            return {
                isError: true,
                content: [{ type: "text" as const, text: "[ERROR] 'text' parameter is required when mode is 'text'." }],
            };
        }

        const masked = maskText(args.text);
        const hasPII = containsPII(args.text);
        const classification = classifyData(args.text);

        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify({
                    originalLength: args.text.length,
                    maskedLength: masked.length,
                    hasPII,
                    classification,
                    masked,
                }, null, 2),
            }],
        };
    }

    // Mode: object
    if (mode === "object" || (mode === "auto" && args.data)) {
        if (!args.data) {
            return {
                isError: true,
                content: [{ type: "text" as const, text: "[ERROR] 'data' parameter is required when mode is 'object'." }],
            };
        }

        const masked = maskObject(args.data, 0, strictMode) as Record<string, unknown>;
        const hasPII = containsPII(JSON.stringify(args.data));
        const classification = classifyData(JSON.stringify(args.data));

        return {
            content: [{
                type: "text" as const,
                text: JSON.stringify({
                    hasPII,
                    classification,
                    masked,
                }, null, 2),
            }],
        };
    }

    return {
        isError: true,
        content: [{ type: "text" as const, text: "[ERROR] Provide either 'text' (string) or 'data' (object) parameter." }],
    };
}
