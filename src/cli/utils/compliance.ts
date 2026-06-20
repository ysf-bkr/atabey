/**
 * Compliance utilities for Agent Atabey.
 *
 * NOTE: The primary compliance scanner lives in framework-mcp:
 *   framework-mcp/src/utils/compliance.ts
 *
 * This file re-exports the framework-mcp version for CLI compatibility.
 * If you need to modify compliance logic, edit framework-mcp/src/utils/compliance.ts
 * instead of this file.
 */

// Re-export everything from framework-mcp's compliance module
export {
    isHighRiskOperation, scanProjectCompliance,
    verifyCorporateCompliance, verifyRiskAndAwaitApproval
} from "../../../framework-mcp/src/utils/compliance.js";

export type { ComplianceIssue, RiskAssessment } from "../../../framework-mcp/src/utils/compliance.js";
