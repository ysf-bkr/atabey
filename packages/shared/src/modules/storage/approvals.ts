/**
 * Human-in-the-Loop approval requests and decisions.
 *
 * Split from the original AtabeyStorage god-class (2026-10-20 audit, S7).
 * Part of the storage inheritance chain; AtabeyStorage (storage.ts) is the facade.
 */

import { logger } from "../observability/logger.js";
import { StorageCooldowns } from "./cooldowns.js";

export class StorageApprovals extends StorageCooldowns {
    public static saveApproval(app: {
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    }): void {
        this.saveApprovalRequest(app);
    }

    public static saveApprovalRequest(request: {
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status?: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    }): void {
        const db = this.getDB();
        db.prepare(`
            INSERT OR REPLACE INTO approvals (
                trace_id, tool_name, agent, risk_score, risk_level, reason, args,
                created_at, expires_at, status, passcode
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            request.traceId,
            request.toolName,
            request.agent,
            request.riskScore,
            request.riskLevel,
            request.reason,
            JSON.stringify(request.args),
            request.createdAt,
            request.expiresAt,
            request.status || "PENDING",
            request.passcode || null
        );
    }

    public static getApproval(traceId: string): {
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    } | null {
        try {
            const row = this.getDB().prepare("SELECT * FROM approvals WHERE trace_id = ?").get(traceId) as {
                trace_id: string;
                tool_name: string;
                agent: string;
                risk_score: number;
                risk_level: string;
                reason: string;
                args: string;
                created_at: number;
                expires_at: number;
                status: string;
                passcode: string | null;
            } | undefined;
            if (!row) return null;
            return {
                traceId: row.trace_id,
                toolName: row.tool_name,
                agent: row.agent,
                riskScore: row.risk_score,
                riskLevel: row.risk_level,
                reason: row.reason,
                args: JSON.parse(row.args || "{}") as Record<string, unknown>,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED",
                passcode: row.passcode || undefined
            };
        } catch (err) {
            logger.debug(`Failed to get approval: ${(err as Error).message}`);
            return null;
        }
    }

    public static getPendingApprovals(): Array<{
        traceId: string;
        toolName: string;
        agent: string;
        riskScore: number;
        riskLevel: string;
        reason: string;
        args: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
        status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";
        passcode?: string;
    }> {
        try {
            const rows = this.getDB().prepare("SELECT * FROM approvals WHERE status = 'PENDING'").all() as Array<{
                trace_id: string;
                tool_name: string;
                agent: string;
                risk_score: number;
                risk_level: string;
                reason: string;
                args: string;
                created_at: number;
                expires_at: number;
                status: string;
                passcode: string | null;
            }>;
            return rows.map(row => ({
                traceId: row.trace_id,
                toolName: row.tool_name,
                agent: row.agent,
                riskScore: row.risk_score,
                riskLevel: row.risk_level,
                reason: row.reason,
                args: JSON.parse(row.args || "{}") as Record<string, unknown>,
                createdAt: row.created_at,
                expiresAt: row.expires_at,
                status: row.status as "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED",
                passcode: row.passcode || undefined
            }));
        } catch (err) {
            logger.debug(`Failed to get pending approvals: ${(err as Error).message}`);
            return [];
        }
    }

    public static updateApprovalStatus(traceId: string, status: string): void {
        this.getDB().prepare("UPDATE approvals SET status = ? WHERE trace_id = ?").run(status, traceId);
    }

    public static clearAllApprovals(): void {
        try {
            this.getDB().prepare("DELETE FROM approvals").run();
        } catch (err) {
            logger.debug(`Failed to clear approvals: ${(err as Error).message}`);
        }
    }
}
