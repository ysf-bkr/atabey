/**
 * Compliance utilities for Atabey.
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

export interface ComplianceIssue {
    file: string;
    line: number;
    rule: string;
}

// ─── High-Risk Operations ───────────────────────────────────────────
// Governance-specific operation patterns (broader than RiskEngine keywords)
// These are business-level risk patterns used for pre-screening before scoring.

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
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
            if (!filePath.includes("definitions.ts") && !filePath.includes("types.ts")) {
                errors.push(`[ERROR] Corporate Compliance Breach: 'any' keyword is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}.`);
            }
        }
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
                const spec = moduleSpecifier.text;
                if (!spec.startsWith(".") && !spec.startsWith("/")) {
                    const forbiddenLibs = ["@chakra-ui", "@mui/", "material-ui", "@shadcn", "antd", "bootstrap"];
                    const lib = forbiddenLibs.find(l => spec === l || spec.startsWith(`${l}/`) || spec.includes(l));
                    if (lib) {
                        errors.push(`[ERROR] Corporate Compliance Breach: External UI library '${lib}' usage is FORBIDDEN at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Build atomic components manually instead.`);
                    }
                }

                // 5. Secure CLI Policy (No direct child_process)
                if (spec === "child_process" || spec === "node:child_process") {
                    const normalizedPath = filePath.replace(/\\/g, "/");
                    const isExempt = normalizedPath.includes("src/cli/") ||
                                     normalizedPath.includes("shared/") ||
                                     normalizedPath.includes("modules/runtime/") ||
                                     normalizedPath.includes("mcp/") ||
                                     normalizedPath.includes("quality-gate.ts") ||
                                     normalizedPath.includes("shell/run_command.ts");
                    if (!isExempt) {
                        errors.push(`[ERROR] Corporate Compliance Breach: Direct 'child_process' usage is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Use secure framework APIs.`);
                    }
                }
            }
        }

        // 6. SQL Safety Policy (Kysely only)
        if (ts.isTaggedTemplateExpression(node)) {
            const tag = node.tag;
            if (ts.isIdentifier(tag) && tag.text === "sql") {
                errors.push(`[ERROR] Corporate Compliance Breach: Raw SQL tagged template detected at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Use Kysely query builder.`);
            }
        }

        // 7. Atomic FS Policy (No raw fs mutations)
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const prop = node.expression;
            if (ts.isIdentifier(prop.expression) && prop.expression.text === "fs") {
                if (["writeFileSync", "appendFileSync"].includes(prop.name.text)) {
                    // Lock files, core atomic fs wrapper, CLI commands, and MCP internal tools/utils are exempt
                    const args = node.arguments;
                    const firstArgText = args.length > 0 ? args[0].getText(sourceFile).toLowerCase() : "";
                    const normalizedPath = filePath.replace(/\\/g, "/");
                    const isExemptFile = normalizedPath.includes("shared/") ||
                                         normalizedPath.includes("src/cli/") ||
                                         normalizedPath.includes("modules/runtime/") ||
                                         normalizedPath.includes("mcp/") ||
                                         normalizedPath.includes("utils/compliance.ts") ||
                                         normalizedPath.includes("utils/memory.ts") ||
                                         normalizedPath.includes("tools/messaging/send_message.ts");
                    if (!firstArgText.includes("lock") && !isExemptFile) {
                        errors.push(`[ERROR] Corporate Compliance Breach: Raw 'fs.${prop.name.text}' mutation detected at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Use atomic utilities instead.`);
                    }
                }
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // 8. Hardcoded Secrets & PII Guard
    const piiKeywords = [
        { regex: /API_KEY\s*=\s*['"][^'"]+['"]/i, msg: "Hardcoded API Key" },
        { regex: /SECRET\s*=\s*['"][^'"]+['"]/i, msg: "Hardcoded Secret" },
        { regex: /PASSWORD\s*=\s*['"][^'"]+['"]/i, msg: "Hardcoded Password" },
        { regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, msg: "PII Detected: Email Address" },
        { regex: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/, msg: "PII Detected: Credit Card Pattern" }
    ];

    for (const { regex, msg } of piiKeywords) {
        if (regex.test(content)) {
            if (msg.includes("Email") && (filePath.endsWith("README.md") || filePath.endsWith("package.json") || filePath.includes("CONTRIBUTING"))) {
                continue;
            }
            errors.push(`[ERROR] Corporate Compliance Breach: ${msg} detected in ${filePath}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(errors.join("\n"));
    }
}

/**
 * Scans a directory recursively for compliance issues.
 */
export function scanProjectCompliance(targetDir: string = "src"): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];
    const effectiveDir = !fs.existsSync(targetDir) && targetDir === "src" && fs.existsSync("packages")
        ? "packages"
        : targetDir;

    if (!fs.existsSync(effectiveDir)) return issues;

    function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== "tests" && entry.name !== "templates") {
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

    scanDir(effectiveDir);
    return issues;
}

// ─── Governance Risk Verification ──────────────────────────────────
// Delegates to RiskEngine for unified risk scoring.
// Governance layer adds operation-context pre-screening.

