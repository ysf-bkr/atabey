import { z } from "zod";

export const StateSchema = z.object({
    phase: z.string(),
    traceId: z.string(),
    managerState: z.enum(["ACTIVE", "IDLE", "PAUSED"]),
});

export const AgentStatusSchema = z.record(z.object({
    state: z.enum(["READY", "EXECUTING", "BLOCKED", "TIMEOUT", "WAITING", "IDLE"]),
    task: z.string(),
    lastUpdated: z.string().optional(),
}));

export const TaskSchema = z.object({
    traceId: z.string(),
    description: z.string(),
    agent: z.string(),
    priority: z.enum(["P1", "P2", "P3", "HIGH", "NORMAL", "LOW"]),
    status: z.enum(["PENDING", "IN_PROGRESS", "APPROVED", "COMPLETED"]),
    createdAt: z.string(),
});
