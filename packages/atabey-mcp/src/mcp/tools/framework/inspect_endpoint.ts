import { dedupe, scanProjectForEndpoints, type ApiEndpoint } from "atabey-shared/api-catalog.js";
import { Storage } from "atabey-shared/storage.js";
import { ToolResult } from "../types.js";

export interface InspectEndpointArgs {
    path: string;
    method?: string;
}

function examplePayload(schemaName?: string): string | null {
    if (!schemaName) return null;
    const name = schemaName.split("/").pop() || schemaName;
    return JSON.stringify({ _schema: name, exampleField: "..." }, null, 2);
}

/**
 * MCP Tool: inspect_endpoint
 *
 * Returns the detailed contract (method, path, auth, request/response schema,
 * source file) for a single endpoint, plus a starter request payload.
 */
export function handleInspectEndpoint(projectRoot: string, args: InspectEndpointArgs): ToolResult {
    if (!args.path) {
        return { isError: true, content: [{ type: "text", text: "[ERROR] 'path' is required." }] };
    }
    try {
        let matches = Storage.findApiEndpoint(args.path, args.method);
        if (matches.length === 0) {
            Storage.replaceApiCatalog(dedupe(scanProjectForEndpoints(projectRoot)));
            matches = Storage.findApiEndpoint(args.path, args.method);
        }
        if (matches.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: `[INSPECT] No endpoint found for "${args.path}". Run get_api_catalog with refresh=true to rescan.`,
                }],
            };
        }

        const report = matches.map((e: ApiEndpoint) => {
            const lines = [
                `## ${e.method} ${e.path}`,
                `- tag: ${e.tag || "-"}`,
                `- auth required: ${e.authRequired ? "yes" : "no"}`,
                `- request schema: ${e.requestSchema || "-"}`,
                `- response schema: ${e.responseSchema || "-"}`,
                `- source: ${e.source || "-"}`,
                `- updated: ${e.updatedAt}`,
            ];
            const example = examplePayload(e.requestSchema);
            if (example && e.method !== "GET" && e.method !== "DELETE") {
                lines.push("", "Request body example:", "```json", example, "```");
            }
            return lines.join("\n");
        });

        return { content: [{ type: "text", text: `[INSPECT]\n\n${report.join("\n\n---\n\n")}` }] };
    } catch (err) {
        return { isError: true, content: [{ type: "text", text: `[INSPECT] Error: ${(err as Error).message}` }] };
    }
}
