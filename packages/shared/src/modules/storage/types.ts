/**
 * Row types for the AtabeyStorage domain modules.
 * Split from the original storage.ts (2026-10-20 audit, S7).
 */

import type { AgentID, LogID, MessageID, TaskID, TraceID } from "../primitives/types.js";

export interface AgentRow {
    name: AgentID;
    state: string;
    task: string;
    last_updated: string;
}

export interface MessageRow {
    id?: MessageID;
    timestamp: string;
    from: AgentID;
    to: AgentID;
    category: string;
    content: string;
    traceId: TraceID;
    parentId?: TaskID;
    status: string;
    priority: string;
    requiresApproval: boolean;
}

export interface TaskRow {
    id: TaskID;
    traceId: TraceID;
    description: string;
    agent: AgentID;
    status: string;
    priority: string;
    dependencies: string[];
    createdAt?: string;
}

export interface LogRow {
    id?: LogID;
    timestamp: string;
    agent: AgentID;
    action: string;
    trace_id?: TraceID;
    status: string;
    summary: string;
    findings?: string;
    prev_hash?: string;
    hash?: string;
}

export interface CostDbRow {
    id: number;
    provider: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
    timestamp: string;
    trace_id: string | null;
}

export interface MessageDbRow {
    id: number;
    timestamp: string;
    sender: string;
    receiver: string;
    category: string;
    content: string;
    trace_id: string;
    parent_id: string | null;
    status: string;
    priority: string;
    requires_approval: number;
}

export interface TaskDbRow {
    id: string;
    trace_id: string;
    description: string;
    agent: string;
    status: string;
    priority: string;
    dependencies: string;
    created_at: string;
}

export interface LogDbRow {
    id: number;
    timestamp: string;
    agent: string;
    action: string;
    trace_id: string | null;
    status: string;
    summary: string;
    findings: string | null;
    prev_hash: string | null;
    hash: string | null;
}
