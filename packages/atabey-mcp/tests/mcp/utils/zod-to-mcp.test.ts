import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToMcpSchema } from "../../../src/mcp/utils/zod-to-mcp.js";
import { TOOLS } from "../../../src/mcp/tools/definitions.js";
import { toolSchemas } from "../../../src/mcp/tools/index.js";

/**
 * The MCP `inputSchema` is what the host uses to decide how to call a tool, so
 * these assertions guard the converter itself rather than a single tool.
 */
describe("zodToMcpSchema", () => {
    it("converts an object schema with required and optional fields", () => {
        const schema = z.object({
            path: z.string().min(1),
            force: z.boolean().optional(),
        }).strict();

        const out = zodToMcpSchema(schema);
        expect(out.type).toBe("object");
        expect(out.required).toEqual(["path"]);
        expect(out.properties.path).toMatchObject({ type: "string", minLength: 1 });
        expect(out.properties.force).toEqual({ type: "boolean" });
        expect(out.additionalProperties).toBe(false);
    });

    it("does not mark defaulted fields as required", () => {
        const out = zodToMcpSchema(z.object({
            capability: z.number().int().min(1).max(10).optional().default(5),
        }).strict());
        expect(out.required).toBeUndefined();
        expect(out.properties.capability).toMatchObject({ type: "integer", default: 5 });
    });

    it("preserves enums, arrays and nested objects", () => {
        const out = zodToMcpSchema(z.object({
            mode: z.enum(["a", "b"]).optional(),
            tags: z.array(z.string()).optional(),
            nested: z.object({ x: z.number() }).optional(),
        }).strict());

        expect(out.properties.mode).toMatchObject({ type: "string", enum: ["a", "b"] });
        expect(out.properties.tags).toMatchObject({ type: "array", items: { type: "string" } });
        expect(out.properties.nested).toMatchObject({
            type: "object",
            properties: { x: { type: "number" } },
            required: ["x"],
        });
    });

    it("omits $schema so hosts receive a plain JSON Schema object", () => {
        const out = zodToMcpSchema(z.object({ a: z.string() }));
        expect(out).not.toHaveProperty("$schema");
    });

    it("passes a JSON round-trip (what actually goes over the wire)", () => {
        const out = zodToMcpSchema(z.object({
            path: z.string(),
            lines: z.array(z.number()).optional(),
        }).strict());
        expect(JSON.parse(JSON.stringify(out))).toEqual(out);
    });
});

describe("tool definitions", () => {
    it("exposes a valid input schema for every tool", () => {
        expect(TOOLS).toHaveLength(40);
        for (const tool of TOOLS) {
            expect(tool.inputSchema.type, tool.name).toBe("object");
            expect(typeof tool.inputSchema.properties, tool.name).toBe("object");
            if (tool.inputSchema.required) {
                for (const key of tool.inputSchema.required) {
                    expect(Object.keys(tool.inputSchema.properties), `${tool.name}.${key}`).toContain(key);
                }
            }
        }
    });

    it("has a validation schema for every tool and no orphan schemas", () => {
        const names = new Set(TOOLS.map(t => t.name));
        const schemaNames = new Set(Object.keys(toolSchemas));
        expect([...schemaNames].sort()).toEqual([...names].sort());
    });

    it("validates a real tool payload through its schema", () => {
        const ok = toolSchemas.read_file.safeParse({ path: "src/index.ts" });
        expect(ok.success).toBe(true);

        const missing = toolSchemas.read_file.safeParse({});
        expect(missing.success).toBe(false);

        const extra = toolSchemas.read_file.safeParse({ path: "a.ts", nope: true });
        expect(extra.success).toBe(false);
    });
});
