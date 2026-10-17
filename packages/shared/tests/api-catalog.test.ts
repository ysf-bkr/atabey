import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    dedupe,
    detectApiDrift,
    endpointKey,
    isApiDriftClean,
    normalizePath,
    parseOpenApiSpec,
    scanProjectForEndpoints,
} from "../src/api-catalog.js";

describe("API catalog scanner & drift", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-api-"));
    });
    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("normalizes params for stable comparison", () => {
        expect(normalizePath("/api/v1/users/:id")).toBe("/api/v1/users/:param");
        expect(normalizePath("/api/v1/users/{id}/")).toBe("/api/v1/users/:param");
        expect(normalizePath("no-slash")).toBe("/no-slash");
    });

    it("parses an OpenAPI v3 spec", () => {
        const endpoints = parseOpenApiSpec({
            openapi: "3.0.0",
            paths: {
                "/api/v1/auth/login": {
                    post: {
                        tags: ["auth"],
                        summary: "Login",
                        security: [{ bearerAuth: [] }],
                        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/LoginRequest" } } } },
                        responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/LoginResponse" } } } } },
                    },
                },
                "/api/v1/users/{id}": {
                    get: { tags: ["users"], responses: { "200": { content: { "application/json": { schema: { title: "User" } } } } } },
                },
            },
        });
        expect(endpoints).toHaveLength(2);
        const login = endpoints.find((e) => e.path.includes("login"))!;
        expect(login.method).toBe("POST");
        expect(login.tag).toBe("auth");
        expect(login.authRequired).toBe(true);
        expect(login.requestSchema).toContain("LoginRequest");
        expect(login.responseSchema).toContain("LoginResponse");
    });

    it("scans Express / Fastify / NestJS route files", () => {
        const src = `
import { authenticate } from "./auth";
app.get("/api/v1/users", authenticate, listUsers);
fastify.post("/api/v1/auth/login", { schema: LoginSchema }, login);
router.delete("/api/v1/users/:id", removeUser);
fastify.route({ method: "PUT", url: "/api/v1/users/:id", schema: UpdateUserSchema });
class C { @Get("health") health() {} }
`;
        fs.writeFileSync(path.join(dir, "routes.ts"), src);
        const endpoints = dedupe(scanProjectForEndpoints(dir));
        const keys = endpoints.map(endpointKey);
        expect(keys).toContain("GET /api/v1/users");
        expect(keys).toContain("POST /api/v1/auth/login");
        expect(keys).toContain("DELETE /api/v1/users/:param");
        expect(keys).toContain("PUT /api/v1/users/:param");
        expect(keys.some((k) => k.endsWith("GET /health") || k.includes("/health"))).toBe(true);

        const login = endpoints.find((e) => e.path.includes("login"))!;
        expect(login.requestSchema).toBe("LoginSchema");
    });

    it("detects added / removed / changed endpoints", () => {
        const base = [
            { method: "GET", path: "/a", authRequired: false, updatedAt: "t0" },
            { method: "POST", path: "/b", authRequired: false, requestSchema: "B1", updatedAt: "t0" },
        ];
        const next = [
            { method: "GET", path: "/a", authRequired: true, updatedAt: "t1" }, // changed (auth)
            { method: "POST", path: "/b", authRequired: false, requestSchema: "B2", updatedAt: "t1" }, // changed (schema)
            { method: "GET", path: "/c", authRequired: false, updatedAt: "t1" }, // added
        ];
        const drift = detectApiDrift(base, next);
        expect(drift.added.map((e) => e.path)).toEqual(["/c"]);
        expect(drift.removed).toHaveLength(0);
        expect(drift.changed).toHaveLength(2);
        expect(isApiDriftClean(drift)).toBe(false);
        expect(isApiDriftClean(detectApiDrift(next, next))).toBe(true);
    });
});
