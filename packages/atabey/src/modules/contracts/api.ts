import { z } from "zod";

/**
 * API Contract — Contract between Backend and Frontend.
 * All API endpoints must conform to these schemas.
 */

// ─── Standart API Response ─────────────────────────────────────────────────────

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
    z.object({
        success: z.boolean(),
        data: dataSchema.optional(),
        error: z
            .object({
                code: z.string(),
                message: z.string(),
                details: z.unknown().optional(),
            })
            .optional(),
        meta: z
            .object({
                page: z.number().int().positive().optional(),
                limit: z.number().int().positive().optional(),
                total: z.number().int().nonnegative().optional(),
                timestamp: z.string().datetime(),
            })
            .optional(),
    });

export type ApiResponse<T = unknown> = z.infer<ReturnType<typeof ApiResponseSchema<z.ZodType<T>>>>;

// ─── Pagination ────────────────────────────────────────────────────────────────

export const PaginationSchema = z.object({
    page: z.number().int().positive().default(1),
    limit: z.number().int().positive().max(100).default(20),
    sort: z.string().optional(),
    order: z.enum(["asc", "desc"]).default("asc"),
});

export type Pagination = z.infer<typeof PaginationSchema>;

// ─── CRUD Contract ─────────────────────────────────────────────────────────────

export const CrudOperationSchema = z.enum(["CREATE", "READ", "UPDATE", "DELETE", "LIST"]);
export type CrudOperation = z.infer<typeof CrudOperationSchema>;

/**
 * CRUD endpoint response contract.
 * Standard response format for each CRUD operation.
 */
export const CrudResponseSchema = z.object({
    operation: CrudOperationSchema,
    resource: z.string(),
    id: z.string().optional(),
    affectedCount: z.number().int().nonnegative().optional(),
    timestamp: z.string().datetime(),
});

export type CrudResponse = z.infer<typeof CrudResponseSchema>;

// ─── Health Check ──────────────────────────────────────────────────────────────

export const HealthCheckSchema = z.object({
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    version: z.string(),
    uptime: z.number().nonnegative(),
    checks: z.record(
        z.object({
            status: z.enum(["pass", "fail"]),
            message: z.string().optional(),
        })
    ),
});

export type HealthCheck = z.infer<typeof HealthCheckSchema>;
