import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
    ApiResponseSchema,
    CrudOperationSchema,
    CrudResponseSchema,
    HealthCheckSchema,
    PaginationSchema
} from "../../../src/modules/contracts/api.js";

describe("API Contracts", () => {
    describe("ApiResponseSchema", () => {
        it("should validate a successful response", () => {
            const schema = ApiResponseSchema(z.string());
            const result = schema.parse({
                success: true,
                data: "hello",
                meta: { timestamp: "2026-01-01T00:00:00Z" },
            });
            expect(result.success).toBe(true);
            expect(result.data).toBe("hello");
        });

        it("should validate an error response", () => {
            const schema = ApiResponseSchema(z.unknown());
            const result = schema.parse({
                success: false,
                error: { code: "NOT_FOUND", message: "Resource not found" },
                meta: { timestamp: "2026-01-01T00:00:00Z" },
            });
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.code).toBe("NOT_FOUND");
        });
    });

    describe("PaginationSchema", () => {
        it("should apply defaults", () => {
            const result = PaginationSchema.parse({});
            expect(result.page).toBe(1);
            expect(result.limit).toBe(20);
            expect(result.order).toBe("asc");
        });

        it("should reject limit over 100", () => {
            expect(() => PaginationSchema.parse({ limit: 200 })).toThrow();
        });
    });

    describe("CrudResponseSchema", () => {
        it("should validate create response", () => {
            const result = CrudResponseSchema.parse({
                operation: "CREATE",
                resource: "users",
                id: "usr_123",
                timestamp: "2026-01-01T00:00:00Z",
            });
            expect(result.operation).toBe("CREATE");
            expect(result.resource).toBe("users");
            expect(result.id).toBe("usr_123");
        });
    });

    describe("HealthCheckSchema", () => {
        it("should validate healthy state", () => {
            const result = HealthCheckSchema.parse({
                status: "healthy",
                version: "1.0.0",
                uptime: 3600,
                checks: { db: { status: "pass" } },
            });
            expect(result.status).toBe("healthy");
        });
    });

    describe("CrudOperationSchema", () => {
        it("should accept valid CRUD operations", () => {
            expect(CrudOperationSchema.parse("CREATE")).toBe("CREATE");
            expect(CrudOperationSchema.parse("DELETE")).toBe("DELETE");
        });

        it("should reject invalid operations", () => {
            expect(() => CrudOperationSchema.parse("INVALID")).toThrow();
        });
    });
});
