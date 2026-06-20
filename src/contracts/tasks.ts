import { z } from "zod";

/**
 * Standard request contract sent to an agent.
 */
export const TaskRequestSchema = z.object({
    traceId: z.string(),
    task: z.string(),
    priority: z.enum(["P1", "P2", "P3", "HIGH", "NORMAL", "LOW"]),
    agent: z.string(),
    context: z.record(z.unknown()).optional(),
});

export type TaskRequest = z.infer<typeof TaskRequestSchema>;

/**
 * Standard response contract sent back by an agent.
 */
export const TaskResponseSchema = z.object({
    traceId: z.string(),
    status: z.enum(["SUCCESS", "FAILED", "RETRY", "WAITING_FOR_APPROVAL"]),
    message: z.string().optional(),
    errorCode: z.string().optional(),
});

export type TaskResponse = z.infer<typeof TaskResponseSchema>;
