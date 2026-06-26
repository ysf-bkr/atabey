import { z } from "zod";

/**
 * A surgical converter to transform Zod schemas into MCP-compliant JSON schemas.
 * This ensures "Single Source of Truth" and eliminates Type Drift.
 */
export function zodToMcpSchema(schema: z.ZodObject<Record<string, z.ZodTypeAny>>): { type: "object"; properties: Record<string, unknown>; required?: string[] } {
    const jsonSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] } = {
        type: "object",
        properties: {}
    };

    const requiredKeys: string[] = [];
    const shape = schema.shape;
    
    for (const key in shape) {
        const field = shape[key];
        const { type, properties, required } = parseZodField(field);

        jsonSchema.properties[key] = {
            type,
            ...(properties || {})
        };

        if (required) {
            requiredKeys.push(key);
        }
    }

    if (requiredKeys.length > 0) {
        jsonSchema.required = requiredKeys;
    }

    return jsonSchema;
}

function parseZodField(field: z.ZodTypeAny): { type: string; properties?: Record<string, unknown>; required: boolean } {
    let type = "string";
    const properties: Record<string, unknown> = {};
    const isRequired = !field.isOptional() && !field.isNullable();
    let unwrapped = field;

    // Handle Optional/Nullable
    while (unwrapped instanceof z.ZodOptional || unwrapped instanceof z.ZodNullable || unwrapped instanceof z.ZodDefault) {
        if (unwrapped instanceof z.ZodDefault) {
            properties.default = unwrapped._def.defaultValue();
        }
        unwrapped = unwrapped._def.innerType;
    }

    // Handle Branded Types
    if (unwrapped instanceof z.ZodBranded) {
        unwrapped = unwrapped._def.type;
    }

    if (unwrapped instanceof z.ZodString) {
        type = "string";
        const checks = unwrapped._def.checks;
        for (const check of checks) {
            if (check.kind === "regex") properties.pattern = check.regex.source;
            if (check.kind === "min") properties.minLength = check.value;
        }
    } else if (unwrapped instanceof z.ZodNumber) {
        type = "number";
    } else if (unwrapped instanceof z.ZodBoolean) {
        type = "boolean";
    } else if (unwrapped instanceof z.ZodEnum) {
        type = "string";
        properties.enum = unwrapped._def.values;
    } else if (unwrapped instanceof z.ZodArray) {
        type = "array";
        const itemType = parseZodField(unwrapped._def.type);
        properties.items = { type: itemType.type, ...(itemType.properties || {}) };
    } else if (unwrapped instanceof z.ZodObject) {
        type = "object";
        const nested = zodToMcpSchema(unwrapped);
        properties.properties = nested.properties;
        if (nested.required) {
            properties.required = nested.required;
        }
    }

    return { type, properties, required: isRequired };
}
