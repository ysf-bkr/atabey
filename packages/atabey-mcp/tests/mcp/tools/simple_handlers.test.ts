import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleMaskPII } from "../../../src/mcp/tools/compliance/mask_pii.js";
import { handleGetSystemHealth } from "../../../src/mcp/tools/observability/get_health.js";
import { handleListDir } from "../../../src/mcp/tools/search/list_dir.js";

/**
 * Small, dependency-free tool handlers: PII masking entry point, directory
 * listing and the host health report. These are part of the public MCP tool
 * surface but had no direct handler tests.
 */
describe("simple MCP tool handlers", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-simple-tools-"));
        fs.mkdirSync(path.join(dir, ".atabey"), { recursive: true });
        fs.writeFileSync(path.join(dir, "a.txt"), "hello");
        fs.mkdirSync(path.join(dir, "sub"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    describe("mask_pii", () => {
        it("masks text and reports PII detection + classification", () => {
            const res = handleMaskPII(dir, { mode: "text", text: "mail me at user@example.com" });
            expect(res.isError).toBeUndefined();
            const body = JSON.parse(res.content[0].text as string);
            expect(body.hasPII).toBe(true);
            expect(body.originalLength).toBeGreaterThan(body.maskedLength - 10);
            expect(body.masked).not.toContain("user@example.com");
            expect(body.classification).toBeDefined();
        });

        it("uses text mode implicitly in auto mode when only text is given", () => {
            const res = handleMaskPII(dir, { text: "no sensitive data here" });
            const body = JSON.parse(res.content[0].text as string);
            expect(body.hasPII).toBe(false);
            expect(body.masked).toBe("no sensitive data here");
        });

        it("masks object values in object mode", () => {
            const res = handleMaskPII(dir, {
                mode: "object",
                data: { email: "user@example.com", nested: { phone: "+90 555 123 4567" } },
            });
            const body = JSON.parse(res.content[0].text as string);
            expect(body.hasPII).toBe(true);
            expect(JSON.stringify(body.masked)).not.toContain("user@example.com");
        });

        it("rejects text mode without text", () => {
            const res = handleMaskPII(dir, { mode: "text" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("'text' parameter is required");
        });

        it("rejects object mode without data", () => {
            const res = handleMaskPII(dir, { mode: "object" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("'data' parameter is required");
        });

        it("rejects an empty request", () => {
            const res = handleMaskPII(dir, { mode: "auto" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("Provide either");
        });
    });

    describe("list_dir", () => {
        it("lists files and directories with type markers", () => {
            const res = handleListDir(dir, { path: "." });
            expect(res.isError).toBeUndefined();
            expect(res.content[0].text).toContain("[DIR] sub");
            expect(res.content[0].text).toContain("a.txt");
        });

        it("reports a missing directory", () => {
            const res = handleListDir(dir, { path: "does-not-exist" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("Directory not found");
        });

        it("reports a path that is not a directory", () => {
            const res = handleListDir(dir, { path: "a.txt" });
            expect(res.isError).toBe(true);
            expect(res.content[0].text).toContain("not a directory");
        });

        it("rejects paths that escape the project root", () => {
            const res = handleListDir(dir, { path: "../.." });
            expect(res.isError).toBe(true);
        });
    });

    describe("get_health", () => {
        it("reports memory, CPU load, platform and uptime", () => {
            const res = handleGetSystemHealth(dir, {});
            const text = res.content[0].text as string;
            expect(text).toContain("System Health Report");
            expect(text).toMatch(/\*\*Memory:\*\* \d+\.\d+% used/);
            expect(text).toContain("**Platform:**");
            expect(text).toContain("**Uptime:**");
        });
    });
});
