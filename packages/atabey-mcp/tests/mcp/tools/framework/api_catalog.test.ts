import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Storage } from "atabey-shared/storage.js";
import { handleGetApiCatalog } from "../../../../src/mcp/tools/framework/get_api_catalog.js";
import { handleInspectEndpoint } from "../../../../src/mcp/tools/framework/inspect_endpoint.js";

describe("API catalog MCP tools", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-api-mcp-"));
        process.env.ATABEY_TEST_DIR = path.join(dir, ".atabey");
        fs.mkdirSync(path.join(dir, ".atabey"), { recursive: true });
        fs.writeFileSync(
            path.join(dir, "routes.ts"),
            [
                'app.get("/api/v1/users", authenticate, listUsers);',
                'fastify.post("/api/v1/auth/login", { schema: LoginSchema }, login);',
            ].join("\n"),
        );
        Storage.reset();
    });

    afterEach(() => {
        Storage.reset();
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("scans and lists the API catalog", () => {
        const res = handleGetApiCatalog(dir, { refresh: true });
        const text = res.content[0].text;
        expect(text).toContain("[API CATALOG]");
        expect(text).toContain("POST /api/v1/auth/login");
        expect(text).toContain("GET /api/v1/users");
        expect(text).toContain("req=LoginSchema");
    });

    it("filters the catalog by search term", () => {
        handleGetApiCatalog(dir, { refresh: true });
        const res = handleGetApiCatalog(dir, { search: "login" });
        expect(res.content[0].text).toContain("login");
        expect(res.content[0].text).not.toContain("/api/v1/users ");
    });

    it("inspects a single endpoint with schema details", () => {
        const res = handleInspectEndpoint(dir, { path: "/api/v1/auth/login", method: "POST" });
        const text = res.content[0].text;
        expect(text).toContain("POST /api/v1/auth/login");
        expect(text).toContain("request schema: LoginSchema");
        expect(text).toContain("Request body example");
    });

    it("returns a helpful message for an unknown endpoint", () => {
        const res = handleInspectEndpoint(dir, { path: "/does/not/exist" });
        expect(res.content[0].text).toContain("No endpoint found");
    });
});
