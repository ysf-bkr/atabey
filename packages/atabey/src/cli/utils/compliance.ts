/**
 * Compliance utilities for Agent Atabey.
 *
 * Enterprise Compliance Scanner — AST-based code quality enforcement.
 * Scans code for policy violations: `any` types, `console.log`, unsafe DOM, etc.
 *
 * Governance Pipeline:
 *   compliance.ts (AST scanning + operation classification)
 *   → RiskEngine (risk scoring)
 *   → QualityGate (quality validation)
 *
 * This is the canonical compliance module used by both CLI and MCP server.
 */

import fs from "fs";
import path from "path";
import ts from "typescript";
import { RiskEngine } from "../../modules/engines/risk-engine.js";
import type { RiskAssessment } from "../../modules/engines/types.js";

export interface ComplianceIssue {
    file: string;
    line: number;
    rule: string;
}

// ─── High-Risk Operations ───────────────────────────────────────────
// Governance-specific operation patterns (broader than RiskEngine keywords)
// These are business-level risk patterns used for pre-screening before scoring.

const HIGH_RISK_OPERATIONS = [
    "user.*create", "user.*delete", "user.*modify",
    "role.*create", "role.*delete",
    "drop table", "drop database", "truncate",
    "bulk delete", "schema.*drop",
    "billing", "payment.*config",
    "secret.*rotate", "env.*rotate",
    "force.*push",
];

export function isHighRiskOperation(taskOrCommand: string): boolean {
    const lower = taskOrCommand.toLowerCase();
    return HIGH_RISK_OPERATIONS.some(op => new RegExp(op, "i").test(lower));
}

// ─── AST-Based Compliance Scanner ──────────────────────────────────

export function verifyCorporateCompliance(content: string, filePath: string): void {
    // Skip compliance checks for non-source files
    if (filePath.endsWith(".json") || filePath.endsWith(".md") || filePath.endsWith(".env.example")) {
        return;
    }

    const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true
    );

    const errors: string[] = [];

    function visit(node: ts.Node) {
        // 1. Zero Console Policy
        if (ts.isPropertyAccessExpression(node)) {
            const expression = node.expression;
            const name = node.name.text;
            if (ts.isIdentifier(expression) && expression.text === "console") {
                if (["log", "warn", "error"].includes(name)) {
                    const exemptFiles = ["logger.ts", "check.ts", "cli.ts", "compliance.ts"];
                    if (!exemptFiles.some(f => filePath.includes(f))) {
                        errors.push(`[ERROR] Corporate Compliance Breach: 'console.${name}' usage is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}.`);
                    }
                }
            }

            // 2. Unsafe DOM Policy
            if (name === "innerHTML" || name === "outerHTML") {
                errors.push(`[ERROR] Corporate Compliance Breach: Unsafe usage of '${name}' detected at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Avoid XSS.`);
            }
        }

        // 3. No Explicit Any Policy
        if (ts.isTypeReferenceNode(node)) {
            if (ts.isIdentifier(node.typeName) && node.typeName.text === "any") {
                if (!filePath.includes("definitions.ts") && !filePath.includes("types.ts")) {
                    errors.push(`[ERROR] Corporate Compliance Breach: 'any' type is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}.`);
                }
            }
        }

        // 4. External UI Library Policy
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                const forbiddenLibs = ["@chakra-ui", "mui", "@shadcn", "antd", "bootstrap"];
                const lib = forbiddenLibs.find(l => moduleSpecifier.text.includes(l));
                if (lib) {
                    errors.push(`[ERROR] Corporate Compliance Breach: External UI library '${lib}' usage is FORBIDDEN at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Build atomic components manually instead.`);
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    if (errors.length > 0) {
        throw new Error(errors.join("\n"));
    }
}

/**
 * Scans a directory recursively for compliance issues.
 */
export function scanProjectCompliance(targetDir: string = "src"): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];

    if (!fs.existsSync(targetDir)) return issues;

    function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
                    scanDir(fullPath);
                }
            } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
                if (entry.name.includes("compliance") || entry.name.includes("definitions") || entry.name.includes("logger")) {
                    continue;
                }
                try {
                    const content = fs.readFileSync(fullPath, "utf8");
                    verifyCorporateCompliance(content, fullPath);
                } catch (err) {
                    const msg = (err as Error).message;
                    const lineMatch = msg.match(/line (\d+)/);
                    issues.push({
                        file: fullPath,
                        line: lineMatch ? parseInt(lineMatch[1], 10) : 0,
                        rule: msg.split("\n")[0] || "Unknown violation",
                    });
                }
            }
        }
    }

    scanDir(targetDir);
    return issues;
}

// ─── Governance Risk Verification ──────────────────────────────────
// Delegates to RiskEngine for unified risk scoring.
// Governance layer adds operation-context pre-screening.

/**
 * Pre-screens a task for high-risk operations before sending to RiskEngine.
 * Returns true if the task matches business-level operation patterns.
 */
export function isGovernanceRiskyOperation(taskOrCommand: string): boolean {
    return isHighRiskOperation(taskOrCommand);
}

/**
 * Verifies if an operation requires approval based on risk assessment.
 * Delegates to RiskEngine.assessTaskRisk() for unified scoring.
 *
 * Governance Pipeline:
 *   1. isHighRiskOperation() — business-level pre-screening
 *   2. RiskEngine.assessTaskRisk() — detailed keyword + path + behavioral scoring
 *   3. Returns RiskAssessment if score >= 60 (requires approval)
 *
 * @returns RiskAssessment if approval needed, null otherwise
 */
export function verifyRiskAndAwaitApproval(task: string, _traceId?: string): RiskAssessment | null {
    const assessment = RiskEngine.assessTaskRisk(task);
    return assessment.requiresApproval ? assessment : null;
}
