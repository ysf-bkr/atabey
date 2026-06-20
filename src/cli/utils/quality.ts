/**
 * Code Quality utilities for Agent Atabey.
 *
 * NOTE: The primary quality scanner lives in framework-mcp:
 *   framework-mcp/src/utils/quality.ts
 *
 * This file re-exports the framework-mcp version for CLI compatibility.
 */

export { analyzePathQuality } from "../../../framework-mcp/src/utils/quality.js";
export type { QualityIssue, QualityAnalysisResult } from "../../../framework-mcp/src/utils/quality.js";
