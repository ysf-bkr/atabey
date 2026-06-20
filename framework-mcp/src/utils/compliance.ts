import ts from "typescript";
import fs from "fs";
import path from "path";
import { resolveFrameworkDir } from "./security.js";

export interface ComplianceIssue {
    file: string;
    line: number;
    rule: string;
}

/**
 * Enterprise Compliance Guardrail
 * Checks content against corporate standards using AST analysis before allowing file mutations.
 */
export function verifyCorporateCompliance(content: string, filePath: string): void {
    // Skip compliance checks for non-source files or specific ignored files
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

    /**
     * Recursive AST Visitor
     */
    function visit(node: ts.Node) {
        // 1. Zero Console Policy
        if (ts.isPropertyAccessExpression(node)) {
            const expression = node.expression;
            const name = node.name.text;
            if (ts.isIdentifier(expression) && expression.text === "console") {
                if (["log", "warn", "error"].includes(name)) {
                    // Check if file is exempt
                    if (!filePath.includes("logger.ts") && !filePath.includes("check.ts") && !filePath.includes("cli.ts") && !filePath.includes("compliance.ts")) {
                        errors.push(`[ERROR] Corporate Compliance Breach: 'console.${name}' usage is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}.`);
                    }
                }
            }
            
            // 2. Unsafe DOM Policy (Avoid XSS)
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
        
        // 4. Zero UI Library Policy
        if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
                const forbiddenLibs = ["@chakra-ui", "mui", "@shadcn", "antd", "bootstrap"];
                const lib = forbiddenLibs.find(l => moduleSpecifier.text.includes(l));
                if (lib) {
                    errors.push(`[ERROR] Corporate Compliance Breach: External UI library '${lib}' usage is FORBIDDEN at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Build atomic components manually instead.`);
                }
                
                // 5. Secure CLI Policy (No direct child_process)
                if (moduleSpecifier.text === "child_process") {
                    const isExempt = filePath.includes("src/cli/commands/") ||
                                     filePath.includes("shared/fs.ts") ||
                                     filePath.includes("shared/lock.ts") ||
                                     filePath.includes("quality-gate.ts") ||
                                     filePath.includes("providers/shared.ts");
                    if (!isExempt) {
                        errors.push(`[ERROR] Corporate Compliance Breach: Direct 'child_process' usage is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}. Use secure framework APIs.`);
                    }
                }
            }
        }
        
        // Handle 'any' as a keyword type
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
            if (!filePath.includes("definitions.ts") && !filePath.includes("types.ts")) {
                errors.push(`[ERROR] Corporate Compliance Breach: 'any' keyword is forbidden at line ${sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1}.`);
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
                    // Lock files, core atomic fs wrapper, and mcp configs are exempt
                    const args = node.arguments;
                    const firstArgText = args.length > 0 ? args[0].getText(sourceFile).toLowerCase() : "";
                    const isExemptFile = filePath.includes("shared/fs.ts") || filePath.includes("src/cli/commands/mcp.ts");
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
            errors.push(`[ERROR] Corporate Compliance Breach: ${msg} detected.`);
        }
    }

    if (errors.length > 0) {
        throw new Error(errors.join("\n"));
    }
}

/**
 * Enterprise Compliance Scanner
 * Scans a directory for compliance issues.
 */
export function scanProjectCompliance(targetDir: string = "src"): ComplianceIssue[] {
    const issues: ComplianceIssue[] = [];
    if (!fs.existsSync(targetDir)) return [];
    
    const files = getAllFiles(targetDir);

    for (const file of files) {
        // Skip exempt files
        if (file.includes("compliance") || file.includes("definitions") || file.includes("logger") || file.includes("cli/index.ts") || file.includes("shared/fs.ts") || file.includes("shared/lock.ts")) continue;

        const content = fs.readFileSync(file, "utf8");
        try {
            verifyCorporateCompliance(content, file);
        } catch (err) {
            const errorLines = (err as Error).message.split("\n");
            for (const errorLine of errorLines) {
                const match = errorLine.match(/line (\d+)\./);
                const line = match ? parseInt(match[1]) : 0;
                issues.push({ file, line, rule: errorLine });
            }
        }
        
        // Technical Debt (TODO/FIXME)
        const lines = content.split("\n");
        lines.forEach((line, index) => {
            if (/\b(TODO|FIXME)\b/i.test(line)) {
                issues.push({ file, line: index + 1, rule: "Unresolved Technical Debt (TODO/FIXME) found" });
            }
        });
    }
    return issues;
}

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (file !== "node_modules" && !file.startsWith(".")) {
                arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
            }
        } else {
            const ext = path.extname(fullPath);
            if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
                arrayOfFiles.push(fullPath);
            }
        }
    });
    return arrayOfFiles;
}

export interface RiskAssessment {
    isRisk: boolean;
    reason?: string;
}

export function isHighRiskOperation(content: string, filePath: string): RiskAssessment {
    const fileName = filePath.toLowerCase();
    
    // 1. Database Deletions
    if (fileName.endsWith(".sql") || fileName.endsWith(".ts") || fileName.endsWith(".js") || fileName.endsWith(".go")) {
        const dropRegex = /\b(DROP\s+(DATABASE|TABLE|SCHEMA|VIEW|INDEX)|TRUNCATE\s+TABLE)\b/i;
        if (dropRegex.test(content)) {
            return { isRisk: true, reason: "Database structural deletion detected (DROP/TRUNCATE)" };
        }
    }
    
    // 2. Package Updates
    if (fileName.endsWith("package.json")) {
        return { isRisk: true, reason: "Dependency/package update operation detected" };
    }
    
    // 3. Deployment Scripts
    if (
        fileName.includes("deploy") || 
        fileName.includes("dockerfile") || 
        fileName.includes("docker-compose") || 
        fileName.includes("k8s") || 
        fileName.includes("github/workflows")
    ) {
        return { isRisk: true, reason: "Infrastructure or deployment script mutation detected" };
    }
    
    return { isRisk: false };
}

export async function verifyRiskAndAwaitApproval(projectRoot: string, content: string, filePath: string): Promise<void> {
    const assessment = isHighRiskOperation(content, filePath);
    if (!assessment.isRisk) {
        return;
    }

    const frameworkDir = resolveFrameworkDir(projectRoot);
    const absoluteFrameworkPath = path.isAbsolute(frameworkDir) 
        ? frameworkDir 
        : path.resolve(projectRoot, frameworkDir);

    const statusPath = path.join(absoluteFrameworkPath, "memory", "status.json");
    const statePath = path.join(absoluteFrameworkPath, "memory", "state.json");
    const messagesDir = path.join(absoluteFrameworkPath, "messages");
    const managerMsgPath = path.join(messagesDir, "manager.json");

    let activeAgent: string | null = null;
    let traceId: string = "UNKNOWN";

    if (fs.existsSync(statePath)) {
        try {
            const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
            if (state && state.traceId) traceId = state.traceId;
        } catch { /* ignore */ }
    }

    let statusData: Record<string, { state: string; task: string }> = {};
    if (fs.existsSync(statusPath)) {
        try {
            statusData = JSON.parse(fs.readFileSync(statusPath, "utf8"));
            for (const [agentName, info] of Object.entries(statusData)) {
                if (info.state === "EXECUTING") {
                    activeAgent = agentName.startsWith("@") ? agentName : `@${agentName}`;
                    break;
                }
            }
        } catch { /* ignore */ }
    }

    if (!activeAgent) throw new Error(`Security Exception: High-risk operation blocked. ${assessment.reason}.`);

    const statusKey = activeAgent.replace("@", "");
    const originalTask = statusData[statusKey]?.task || "Executing task";
    statusData[statusKey] = {
        state: "WAITING_FOR_APPROVAL",
        task: `[PAUSED] Waiting for approval: ${assessment.reason} on ${filePath}`
    };
    try {
        fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
    } catch { /* ignore */ }

    if (!fs.existsSync(messagesDir)) fs.mkdirSync(messagesDir, { recursive: true });

    const alertMsg = {
        timestamp: new Date().toISOString(),
        from: activeAgent,
        to: "@manager",
        category: "ALERT",
        content: `High-risk operation: ${assessment.reason} on ${filePath}`,
        traceId: traceId,
        status: "PENDING",
        priority: "HIGH",
        requiresApproval: true,
        action: `MUTATION:${filePath}`
    };

    try {
        fs.appendFileSync(managerMsgPath, JSON.stringify(alertMsg) + "\n");
    } catch (err) {
        statusData[statusKey] = { state: "EXECUTING", task: originalTask };
        fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
        throw new Error("Security Exception: Failed to queue approval request.", { cause: err });
    }

    const pollIntervalMs = 500;
    const timeoutMs = 60000;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
        if (fs.existsSync(managerMsgPath)) {
            try {
                const lines = fs.readFileSync(managerMsgPath, "utf8").trim().split("\n");
                for (const line of lines) {
                    if (!line.trim()) continue;
                    const parsed = JSON.parse(line);
                    if (parsed.traceId === traceId && parsed.category === "ALERT" && parsed.action === `MUTATION:${filePath}`) {
                        if (parsed.status === "APPROVED") {
                            statusData[statusKey] = { state: "EXECUTING", task: originalTask };
                            fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
                            return;
                        } else if (parsed.status === "PROCESSED" || parsed.status === "DENIED") {
                            throw new Error("Security Exception: High-risk operation was explicitly DENIED.");
                        }
                    }
                }
            } catch (err) {
                if ((err as Error).message.includes("explicitly DENIED")) throw err;
            }
        }
    }

    statusData[statusKey] = { state: "EXECUTING", task: originalTask };
    try {
        fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
    } catch { /* ignore */ }
    throw new Error("Security Exception: High-risk operation timed out waiting for approval.");
}


