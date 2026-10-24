/**
 * Minimal TOML emitter for Codex's `config.toml`.
 *
 * Codex does not read JSON MCP config: it reads `[mcp_servers.<name>]` tables
 * from `~/.codex/config.toml` or `.codex/config.toml`. Pulling in a full TOML
 * dependency for one small table would be overkill, so this module emits and
 * replaces exactly the table Atabey owns and nothing else.
 *
 * Scope: only the shapes Atabey writes (string, string[]). Everything else is
 * rejected loudly instead of being silently mis-serialised.
 */

export type TomlScalar = string | number | boolean;
export type TomlValue = TomlScalar | TomlScalar[] | Record<string, TomlScalar>;

function escapeString(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t");
}

function renderScalar(value: TomlScalar): string {
    if (typeof value === "string") return `"${escapeString(value)}"`;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`TOML: non-finite number '${value}'`);
        return String(value);
    }
    if (typeof value === "boolean") return value ? "true" : "false";
    throw new Error(`TOML: unsupported scalar type '${typeof value}'`);
}

function renderValue(value: TomlValue): string {
    if (Array.isArray(value)) return `[${value.map((v) => renderScalar(v)).join(", ")}]`;
    if (value !== null && typeof value === "object") {
        throw new Error("TOML: nested tables must be emitted as their own [table] header");
    }
    return renderScalar(value as TomlScalar);
}

/** Renders `[tableName]` plus its key/value pairs, then nested inline sub-tables. */
export function renderTomlTable(tableName: string, values: Record<string, TomlValue>): string {
    const scalars: Array<[string, TomlValue]> = [];
    const tables: Array<[string, Record<string, TomlScalar>]> = [];

    for (const [key, value] of Object.entries(values)) {
        if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            tables.push([key, value as Record<string, TomlScalar>]);
        } else {
            scalars.push([key, value]);
        }
    }

    const lines: string[] = [`[${tableName}]`];
    for (const [key, value] of scalars) lines.push(`${key} = ${renderValue(value)}`);

    for (const [key, sub] of tables) {
        lines.push("");
        lines.push(`[${tableName}.${key}]`);
        for (const [subKey, subValue] of Object.entries(sub)) {
            lines.push(`${subKey} = ${renderValue(subValue)}`);
        }
    }

    return lines.join("\n");
}

/**
 * Removes an existing `[table]` and all of its `[table.*]` sub-tables from TOML
 * text, leaving every other table untouched.
 */
export function removeTomlTable(text: string, tableName: string): string {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/;
    const keep: string[] = [];
    let skipping = false;

    for (const line of text.split(/\r?\n/)) {
        const match = header.exec(line);
        if (match) {
            const name = match[1].trim();
            skipping = name === tableName || name.startsWith(`${tableName}.`);
            if (skipping) continue;
        }
        if (!skipping) keep.push(line);
    }

    // Collapse the blank-line runs a removal can leave behind.
    return keep.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "").replace(/\s+$/, "");
}

/**
 * Idempotently writes `[tableName]` into existing TOML text: the previous
 * Atabey-owned table is replaced, all other content is preserved verbatim.
 */
export function upsertTomlTable(existing: string, tableName: string, values: Record<string, TomlValue>): string {
    const withoutTable = removeTomlTable(existing, tableName);
    const rendered = renderTomlTable(tableName, values);
    if (!withoutTable) return `${rendered}\n`;
    return `${withoutTable}\n\n${rendered}\n`;
}
