import { PlanID, TaskID, TraceID } from "../../shared/types.js";

/**
 * Atabey Engine Trio — Shared Types
 */

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RiskFactor {
    factor: string;
    score: number;
    description: string;
}

export interface RiskAssessment {
    totalScore: number;
    severity: RiskSeverity;
    factors: RiskFactor[];
    requiresApproval: boolean;
}

export interface EvaluationResult {
    traceId: TraceID;
    agent: string;
    score: number; // 0-100
    metrics: {
        compilation: boolean;
        lint: boolean;
        tests: boolean;
        compliance: number; // Number of violations
    };
    durationMs: number;
    timestamp: string;
}

export interface ProjectHealth {
    score: number;
    codeQuality: number;
    security: number;
    architecture: number;
    agentHealth?: number;
    totalAgents?: number;
    activeAgents?: number;
    blockedAgents?: number;
    totalLogs?: number;
    lastUpdated: string;
}

export interface PlanTask {
    id: TaskID;
    agent: string;
    task: string;
    dependencies: TaskID[];
    /**
     * [C4] Acceptance criteria — verifiable conditions that must hold before
     * the task may transition to COMPLETED (linked to the lifecycle MERGING
     * exit criteria). Required at the submit_plan boundary; optional for
     * programmatic callers for backward compatibility.
     */
    acceptanceCriteria?: string[];
}

export interface Plan {
    planId: PlanID;
    tasks: PlanTask[];
}
