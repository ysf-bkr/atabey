/**
 * Code Quality utilities for Agent Atabey.
 *
 * Re-exports from atabey-mcp for CLI compatibility.
 * atabey-mcp package provides the actual quality scanner.
 */

export { analyzePathQuality } from "../../../atabey-mcp/src/mcp/utils/quality.js";
export type { QualityAnalysisResult, QualityIssue } from "../../../atabey-mcp/src/mcp/utils/quality.js";
