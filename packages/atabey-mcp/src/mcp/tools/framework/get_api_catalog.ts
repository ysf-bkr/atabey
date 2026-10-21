import { dedupe, scanProjectForEndpoints } from "atabey-shared/api-catalog.js";
import { Storage } from "atabey-shared/storage.js";
import { ToolResult } from "../types.js";

export interface GetApiCatalogArgs {
    search?: string;
    tag?: string;
    method?: string;
    path?: string;
    refresh?: boolean;
}

/**
 * MCP Tool: get_api_catalog
 *
 * Returns a compact, structured list of backend API endpoints so frontend /
 * mobile agents can integrate without reading route source files.
 */
export function handleGetApiCatalog(projectRoot: string, args: GetApiCatalogArgs): ToolResult {
    try {
        const needsScan = args.refresh === true || Storage.getApiEndpoints().length === 0;
        if (needsScan) {
            const scanned = dedupe(scanProjectForEndpoints(projectRoot));
            Storage.replaceApiCatalog(scanned);
        }

        let endpoints = Storage.getApiEndpoints({
            search: args.search,
            tag: args.tag,
            method: args.method,
        });
        if (args.path) {
            const needle = args.path.toLowerCase();
            endpoints = endpoints.filter((e) => e.path.toLowerCase().includes(needle));
        }

        if (endpoints.length === 0) {
            return {
                content: [{
                    type: "text",
                    text: "[API CATALOG] No endpoints matched. Try a broader filter, or pass refresh=true to rescan route files.",
                }],
            };
        }

        const lines = endpoints.map((e) => {
            const flags = [e.tag ? `[${e.tag}]` : "", e.authRequired ? "(auth)" : ""].filter(Boolean).join(" ");
            const schemas = `req=${e.requestSchema || "-"} res=${e.responseSchema || "-"}`;
            return `- ${e.method} ${e.path}${flags ? " " + flags : ""}  ${schemas}`;
        });

        return {
            content: [{
                type: "text",
                text: `[API CATALOG] ${endpoints.length} endpoint(s):\n${lines.join("\n")}\n\nUse inspect_endpoint { path, method } for full types/payloads.`,
            }],
        };
    } catch (err) {
        return {
            isError: true,
            content: [{ type: "text", text: `[API CATALOG] Error: ${(err as Error).message}` }],
        };
    }
}
