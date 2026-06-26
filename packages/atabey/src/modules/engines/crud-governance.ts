/**
 * [GOV] CRUD Governance Engine — Enterprise Administrative Operation Gate
 *
 * Implements the CRUD governance standards from templates/standards/crud-governance.md.
 * Prevents specialist agents from performing high-risk operations autonomously.
 *
 * High-risk operations requiring @manager + human approval:
 * 1. Database schema changes (DDL)
 * 2. Bulk data deletion/purge
 * 3. User authorization/role changes
 * 4. Payment/billing integrations
 * 5. PII export
 * 6. Environment variable/secret changes
 * 7. Production deployment
 * 8. Force-push to shared branches
 */

import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { asAgentID, asTraceID } from "../../shared/types.js";

export type HighRiskOperation =
    | "SCHEMA_CHANGE"
    | "BULK_DELETE"
    | "ROLE_CHANGE"
    | "BILLING_CHANGE"
    | "PII_EXPORT"
    | "ENV_CHANGE"
    | "PRODUCTION_DEPLOY"
    | "FORCE_PUSH";

export interface HighRiskRequest {
    operation: HighRiskOperation;
    agent: string;
    description: string;
    traceId: string;
    target?: string;
    reason: string;
}

export interface GovernanceDecision {
    allowed: boolean;
    requiresApproval: boolean;
    reason: string;
    escalatedTo: string | null;
}

/**
 * CRUD Governance — enforces the enterprise administrative operation policy.
 *
 * Flow:
 * 1. Agent requests a high-risk operation
 * 2. GovernanceEngine checks if the agent is authorized
 * 3. Unauthorized → escalates to @manager, sets requiresApproval=true
 * 4. @manager reviews → if approved → human approval via `atabey approve`
 * 5. Only after human approval → operation proceeds
 */
export class GovernanceEngine {
    // Agents authorized to perform each operation type
    private static AUTHORIZED_AGENTS: Record<HighRiskOperation, string[]> = {
        SCHEMA_CHANGE: ["@manager", "@database", "@architect"],
        BULK_DELETE: ["@manager"],
        ROLE_CHANGE: ["@manager"],
        BILLING_CHANGE: ["@manager"],
        PII_EXPORT: ["@manager", "@security"],
        ENV_CHANGE: ["@manager", "@devops"],
        PRODUCTION_DEPLOY: ["@manager", "@devops"],
        FORCE_PUSH: ["@manager", "@git"],
    };

    // Risk weight for each operation (used by RiskEngine)
    private static OPERATION_RISK: Record<HighRiskOperation, number> = {
        SCHEMA_CHANGE: 70,
        BULK_DELETE: 90,
        ROLE_CHANGE: 80,
        BILLING_CHANGE: 85,
        PII_EXPORT: 95,
        ENV_CHANGE: 75,
        PRODUCTION_DEPLOY: 80,
        FORCE_PUSH: 60,
    };

    /**
     * Evaluates whether an agent is allowed to perform a high-risk operation.
     * If unauthorized, escalates to @manager and requires human approval.
     */
    public static async evaluate(
        agent: string,
        operation: HighRiskOperation,
        description: string,
        traceId: string
    ): Promise<GovernanceDecision> {
        const normalizedAgent = agent.startsWith("@") ? agent : `@${agent}`;
        const authorizedAgents = GovernanceEngine.AUTHORIZED_AGENTS[operation];

        // Check if agent is authorized
        if (!authorizedAgents.includes(normalizedAgent)) {
            const escalationMsg = `[GOV] ${normalizedAgent} attempted ${operation} — UNAUTHORIZED. Escalated to @manager.`;

            logger.warn(escalationMsg);

            // Log the violation
            AtabeyStorage.saveLog({
                agent: normalizedAgent.replace("@", ""),
                action: "GOVERNANCE_VIOLATION",
                trace_id: traceId,
                status: "BLOCKED",
                summary: `${normalizedAgent} attempted unauthorized ${operation}: ${description}`
            });

            // Escalate to @manager via Hermes
            AtabeyStorage.saveMessage({
                from: asAgentID(normalizedAgent),
                to: asAgentID("@manager"),
                category: "ALERT" as const,
                content: `[GOVERNANCE] High-risk operation ${operation} requested by ${normalizedAgent}: ${description}. Requires your review and human approval.`,
                traceId: asTraceID(traceId),
                timestamp: new Date().toISOString(),
                status: "PENDING" as const,
                priority: "HIGH" as const,
                requiresApproval: true,
            });

            return {
                allowed: false,
                requiresApproval: true,
                reason: `${normalizedAgent} is not authorized for ${operation}. Escalated to @manager. Human approval required.`,
                escalatedTo: "@manager",
            };
        }

        // Authorized but still high-risk — requires human approval
        const riskScore = GovernanceEngine.OPERATION_RISK[operation];

        AtabeyStorage.saveLog({
            agent: normalizedAgent.replace("@", ""),
            action: "GOVERNANCE_APPROVAL_REQUIRED",
            trace_id: traceId,
            status: "PENDING",
            summary: `${normalizedAgent} requested ${operation} (risk: ${riskScore}). Human approval required.`
        });

        // Send approval request to @manager
        AtabeyStorage.saveMessage({
            from: asAgentID(normalizedAgent),
            to: asAgentID("@manager"),
            category: "ACTION" as const,
            content: `[APPROVAL REQUIRED] ${operation}: ${description} (risk score: ${riskScore}). Agent: ${normalizedAgent}`,
            traceId: asTraceID(traceId),
            timestamp: new Date().toISOString(),
            status: "PENDING" as const,
            priority: "HIGH" as const,
            requiresApproval: true,
        });

        return {
            allowed: false,
            requiresApproval: true,
            reason: `${operation} requires human approval (risk score: ${riskScore}). Approval request sent to @manager.`,
            escalatedTo: "@manager",
        };
    }

    /**
     * Approves a previously escalated high-risk operation.
     * Called by `atabey approve <traceId>` CLI command.
     */
    public static async approve(operation: HighRiskOperation, traceId: string): Promise<boolean> {
        logger.info(`[GOV] Operation ${operation} approved for trace ${traceId}`);

        AtabeyStorage.saveLog({
            agent: "@human",
            action: "GOVERNANCE_APPROVED",
            trace_id: traceId,
            status: "SUCCESS",
            summary: `Human approved ${operation} for trace ${traceId}`
        });

        return true;
    }

    /**
     * Rejects a previously escalated high-risk operation.
     */
    public static async reject(operation: HighRiskOperation, traceId: string, reason?: string): Promise<boolean> {
        logger.warn(`[GOV] Operation ${operation} REJECTED for trace ${traceId}: ${reason || "No reason given"}`);

        AtabeyStorage.saveLog({
            agent: "@human",
            action: "GOVERNANCE_REJECTED",
            trace_id: traceId,
            status: "FAILED",
            summary: `Human rejected ${operation} for trace ${traceId}: ${reason || "No reason"}`
        });

        return false;
    }

    /**
     * Detects high-risk operations from a natural language task description.
     * Uses keyword matching to classify the operation type.
     */
    public static classifyTask(task: string): HighRiskOperation | null {
        const lower = task.toLowerCase();

        if (/\b(drop|truncate|alter|create\s+table|migration|schema)\b/i.test(task) &&
            /\b(database|table|column|index)\b/i.test(lower)) {
            return "SCHEMA_CHANGE";
        }
        if (/\b(delete\s+all|purge\s+all|bulk\s+delete|clear\s+all|truncate)\b/i.test(task)) {
            return "BULK_DELETE";
        }
        if (/\b(role|permission|authorization|user\s+role|admin)\b/i.test(task) &&
            /\b(change|modify|update|create|delete|assign)\b/i.test(lower)) {
            return "ROLE_CHANGE";
        }
        if (/\b(billing|payment|invoice|subscription|pricing)\b/i.test(task)) {
            return "BILLING_CHANGE";
        }
        if (/\b(pii|personal\s+data|export\s+user|gdpr|kvkk|privacy)\b/i.test(task)) {
            return "PII_EXPORT";
        }
        if (/\b(environment|env\s+var|secret|api\s+key)\b/i.test(task) &&
            /\b(change|update|modify|rotate|set)\b/i.test(lower)) {
            return "ENV_CHANGE";
        }
        if (/\b(deploy|release|production|prod)\b/i.test(task)) {
            return "PRODUCTION_DEPLOY";
        }
        if (/\b(force\s+push|rewrite\s+history|git\s+push\s+--force)\b/i.test(task)) {
            return "FORCE_PUSH";
        }

        return null;
    }
}
