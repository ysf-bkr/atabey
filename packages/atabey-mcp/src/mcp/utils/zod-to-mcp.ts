import { z } from "zod";

/**
 * Converts a Zod schema into an MCP-compliant JSON Schema.
 *
 * Uses Zod 4's built-in `z.toJSONSchema()` instead of walking `_def` internals:
 * the internal shape is not part of the public API and changed between v3 and
 * v4, and the previous hand-rolled walker mis-reported required fields for
 * defaulted and nested schemas.
 *
 * `io: "input"` is used because MCP validates the *arguments* a host sends, not
 * the parsed output. `$schema` is removed: MCP's `inputSchema` is a plain JSON
 * Schema object and some hosts reject unknown top-level keywords.
 */
export interface McpInputSchema {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
}

export function zodToMcpSchema(schema: z.ZodObject): McpInputSchema {
    const json = z.toJSONSchema(schema, {
        io: "input",
        // Keep the emitted JSON compact and free of dialect markers.
        unrepresentable: "any",
    }) as Record<string, unknown>;

    const rest = { ...json };
    delete rest.$schema;
    return {
        type: "object",
        properties: (rest.properties as Record<string, unknown>) ?? {},
        ...(Array.isArray(rest.required) && rest.required.length > 0
            ? { required: rest.required as string[] }
            : {}),
        ...(rest.additionalProperties !== undefined
            ? { additionalProperties: rest.additionalProperties as boolean }
            : {}),
    };
}
