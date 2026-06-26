/**
 * Agent Atabey Framework — Internal Branded Types
 * Used to enforce absolute type safety within the core orchestration logic.
 */

export type Brand<K, T> = K & { __brand: T };

export type TraceID = Brand<string, "TraceID">;
export type AgentID = Brand<string, "AgentID">;
export type PhaseID = Brand<string, "PhaseID">;
export type ProjectPath = Brand<string, "ProjectPath">;
export type MessageID = Brand<number, "MessageID">;
export type TaskID = Brand<string, "TaskID">;
export type LogID = Brand<number, "LogID">;
export type PlanID = Brand<string, "PlanID">;

/**
 * Casts a raw string to a Branded Type.
 * Use this only at the boundaries of the system.
 */
export function asTraceID(val: string): TraceID { return val as TraceID; }
export function asAgentID(val: string): AgentID { return val as AgentID; }
export function asPhaseID(val: string): PhaseID { return val as PhaseID; }
export function asProjectPath(val: string): ProjectPath { return val as ProjectPath; }
export function asMessageID(val: number): MessageID { return val as MessageID; }
export function asTaskID(val: string): TaskID { return val as TaskID; }
export function asLogID(val: number): LogID { return val as LogID; }
export function asPlanID(val: string): PlanID { return val as PlanID; }
