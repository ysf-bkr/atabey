import { describe, expect, it } from "vitest";
import { removeTomlTable, renderTomlTable, upsertTomlTable } from "../../src/cli/utils/toml.js";

/**
 * The Codex adapter depends on this emitter writing valid TOML. A quoting bug
 * here silently breaks the Codex MCP entry, so strings (especially Windows
 * paths) are asserted explicitly.
 */
describe("toml emitter", () => {
    it("renders a table with scalar and array values", () => {
        const out = renderTomlTable("mcp_servers.atabey", {
            command: "npx",
            args: ["-y", "atabey-mcp"],
        });
        expect(out).toBe('[mcp_servers.atabey]\ncommand = "npx"\nargs = ["-y", "atabey-mcp"]');
    });

    it("renders nested objects as their own sub-tables", () => {
        const out = renderTomlTable("mcp_servers.atabey", {
            command: "npx",
            env: { ATABEY_PROJECT_ROOT: "/work/proj", MCP_TRANSPORT: "stdio" },
        });
        expect(out).toContain("[mcp_servers.atabey]");
        expect(out).toContain("[mcp_servers.atabey.env]");
        expect(out).toContain('ATABEY_PROJECT_ROOT = "/work/proj"');
    });

    it("escapes quotes and backslashes (Windows paths)", () => {
        const out = renderTomlTable("mcp_servers.atabey.env", {
            ATABEY_PROJECT_ROOT: "C:\\Users\\me\\proj",
            QUOTED: 'say "hi"',
        });
        expect(out).toContain('ATABEY_PROJECT_ROOT = "C:\\\\Users\\\\me\\\\proj"');
        expect(out).toContain('QUOTED = "say \\"hi\\""');
    });

    it("escapes newlines instead of emitting invalid multi-line strings", () => {
        const out = renderTomlTable("t", { v: "a\nb" });
        expect(out).toContain('v = "a\\nb"');
        expect(out).not.toContain("\n b");
    });

    it("rejects non-finite numbers", () => {
        expect(() => renderTomlTable("t", { v: Number.NaN })).toThrow(/non-finite/);
        expect(() => renderTomlTable("t", { v: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    });

    it("removes a table and its sub-tables, leaving siblings intact", () => {
        const text = [
            'model = "gpt-5-codex"',
            "",
            "[mcp_servers.atabey]",
            'command = "old"',
            "",
            "[mcp_servers.atabey.env]",
            'A = "1"',
            "",
            "[mcp_servers.context7]",
            'command = "npx"',
        ].join("\n");

        const out = removeTomlTable(text, "mcp_servers.atabey");
        expect(out).not.toContain("mcp_servers.atabey");
        expect(out).toContain('model = "gpt-5-codex"');
        expect(out).toContain("[mcp_servers.context7]");
    });

    it("does not remove tables that merely share a prefix", () => {
        const text = ["[mcp_servers.atabey_extra]", 'command = "keep"'].join("\n");
        const out = removeTomlTable(text, "mcp_servers.atabey");
        expect(out).toContain("[mcp_servers.atabey_extra]");
    });

    it("upsert is idempotent", () => {
        const once = upsertTomlTable("", "mcp_servers.atabey", { command: "npx", args: ["-y", "atabey-mcp"] });
        const twice = upsertTomlTable(once, "mcp_servers.atabey", { command: "npx", args: ["-y", "atabey-mcp"] });
        expect(twice).toBe(once);
        expect(twice.match(/\[mcp_servers\.atabey\]/g)).toHaveLength(1);
    });

    it("upsert preserves unrelated content and replaces an old value", () => {
        const existing = ['model = "gpt-5"', "", "[mcp_servers.atabey]", 'command = "old"', ""].join("\n");
        const out = upsertTomlTable(existing, "mcp_servers.atabey", { command: "npx" });
        expect(out).toContain('model = "gpt-5"');
        expect(out).toContain('command = "npx"');
        expect(out).not.toContain('command = "old"');
    });
});
