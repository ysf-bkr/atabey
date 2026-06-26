import { z } from "zod";

/**
 * Standard Color Palette Schema
 */
export const ColorPaletteSchema = z.object({
    primary: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    secondary: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
    accent: z.string().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/),
});

/**
 * Agent Atabey config.json Schema
 */
export const ConfigSchema = z.object({
    name: z.string().default("Agent Atabey"),
    version: z.string(),
    frameworkDir: z.string().optional(),
    theme: z.object({
        palette: z.string(),
        colors: ColorPaletteSchema
    }).optional(),
    paths: z.object({
        backend: z.string(),
        frontend: z.string(),
        docs: z.string(),
        tests: z.string(),
    }).default({
        backend: "apps/backend",
        frontend: "apps/web",
        docs: "docs",
        tests: "tests"
    })
});

/**
 * MCP mcp.json Schema
 */
export const McpConfigSchema = z.object({
    mcpServers: z.record(z.object({
        command: z.string(),
        args: z.array(z.string()),
        env: z.record(z.string()).optional()
    }))
});

export type AtabeyConfig = z.infer<typeof ConfigSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
