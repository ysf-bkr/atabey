import { generateULID } from "atabey/src/cli/utils/time.js";
import { maskToolArgs, maskToolResult } from "../../shared/pii.js";
import { Storage } from "../../shared/storage.js";
import { TOOLS, toolHandlers, toolSchemas } from "../tools/index.js";

function validateArgs(toolName: string, args: Record<string, unknown>): string | null {
    const schema = toolSchemas[toolName];
    if (schema) {
        const result = schema.safeParse(args);
        if (!result.success) {
            return result.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ");
        }
        return null;
    }
    const definition = TOOLS.find(t => t.name === toolName);
    if (!definition) return `Unknown tool: ${toolName}`;
    const required = definition.inputSchema.required || [];
    for (const field of required) {
        if (args[field] === undefined || args[field] === null || args[field] === "") {
            return `Missing required argument: '${field}' for tool '${toolName}'`;
        }
    }
    return null;
}

export async function handleCallToolWithGovernance(
    toolName: string,
    args: Record<string, unknown> | undefined,
    meta: { client?: { name?: string; version?: string } } | undefined,
    context: {
        PROJECT_ROOT: string;
        broadcastWS: (type: string, payload: unknown) => void;
    }
): Promise<{ isError?: boolean; content: Array<{ type: "text"; text: string }> }> {
    const { PROJECT_ROOT, broadcastWS } = context;
    const clientAgent = meta?.client?.name || "mcp-client";

    try {
        const handler = toolHandlers[toolName];
        if (!handler) {
            return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Unknown tool: ${toolName}` }] };
        }

        const validationError = validateArgs(toolName, args || {});
        if (validationError) {
            return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Validation Error: ${validationError}` }] };
        }

        // [PII/GDPR/KVKK] Mask args before handler
        const maskedArgs = maskToolArgs(args || {});

        // [TOKEN ECONOMY] Log token usage
        const argsJson = JSON.stringify(maskedArgs);
        const estimatedTokens = Math.ceil(argsJson.length / 4);
        try {
            const { Metrics } = await import("../utils/metrics.js");
            Metrics.logUsage(PROJECT_ROOT, clientAgent, toolName, estimatedTokens);
        } catch (e) {
            process.stderr.write(`[METRICS] Error: ${(e as Error).message}\n`);
        }

        // [GOVERNANCE] Validate arguments against governance rules (pre-execution)
        try {
            const { validateArgsAgainstRules } = await import("../utils/rules-engine.js");
            const governanceError = validateArgsAgainstRules(toolName, maskedArgs);
            if (governanceError) {
                process.stderr.write(`[GOVERNANCE] Blocked: ${governanceError}\n`);
                broadcastWS("governance_violation", { agent: clientAgent, tool: toolName, error: governanceError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: governanceError }] };
            }
        } catch (e) {
            process.stderr.write(`[GOVERNANCE] Module error: ${(e as Error).message}\n`);
        }

        // [DISCIPLINE] Enforce AI discipline at tool level BEFORE execution
        try {
            const { enforceDiscipline } = await import("../utils/discipline.js");
            const disciplineError = await enforceDiscipline(clientAgent, toolName, maskedArgs);
            if (disciplineError) {
                process.stderr.write(`[DISCIPLINE] Blocked: ${disciplineError}\n`);
                broadcastWS("discipline_violation", { agent: clientAgent, tool: toolName, error: disciplineError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: `[DISCIPLINE] ${disciplineError}` }] };
            }
        } catch (e) {
            process.stderr.write(`[DISCIPLINE] Module error: ${(e as Error).message}\n`);
        }

        // [SILENT ROUTER] Detect agent from context and inject rules
        const traceId = generateULID();
        let detectedAgent = clientAgent;
        try {
            const { detectAgent, stealthNotify } = await import("../utils/silent-router.js");
            detectedAgent = detectAgent(toolName, maskedArgs);
            if (detectedAgent !== clientAgent) {
                stealthNotify(detectedAgent, toolName, `Silently routed from ${clientAgent}`);
                process.stderr.write(`[SILENT ROUTER] ${toolName} → ${detectedAgent} (from ${clientAgent})\n`);
            }
        } catch (e) {
            process.stderr.write(`[SILENT ROUTER] Error: ${(e as Error).message}\n`);
        }

        // [CRUD GOVERNANCE] Verify agent permissions for high-risk operations
        try {
            const { GovernanceEngine } = await import("atabey/src/modules/engines/crud-governance.js");
            const taskStr = toolName === "run_shell_command" ? (maskedArgs.command as string || "") : `${toolName} ${argsJson}`;
            const operation = GovernanceEngine.classifyTask(taskStr);
            if (operation) {
                const decision = await GovernanceEngine.evaluate(detectedAgent, operation, taskStr, traceId);
                if (decision.requiresApproval) {
                    process.stderr.write(`[GOVERNANCE] Blocked: ${decision.reason}\n`);
                    broadcastWS("governance_violation", { agent: detectedAgent, tool: toolName, error: decision.reason, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: `[GOVERNANCE] Blocked: ${decision.reason}` }] };
                }
            }
        } catch (e) {
            process.stderr.write(`[GOVERNANCE] evaluate error: ${(e as Error).message}\n`);
        }

        // [LOOP DETECTION] Check for infinite loop patterns
        try {
            const { recordAndCheck } = await import("../utils/loop-detector.js");
            const loopAlert = recordAndCheck(detectedAgent, toolName, maskedArgs);
            if (loopAlert) {
                process.stderr.write(`[LOOP DETECT] ${loopAlert.type}: ${loopAlert.detail}\n`);
                broadcastWS("loop_detected", { agent: detectedAgent, tool: toolName, alert: loopAlert, timestamp: new Date().toISOString() });
                if (loopAlert.severity === "critical" && loopAlert.cooldownUntil) {
                    const remaining = Math.ceil((loopAlert.cooldownUntil - Date.now()) / 1000);
                    return {
                        isError: true,
                        content: [{ type: "text" as const, text: `[LOOP DETECTED] ${loopAlert.detail} Cooldown: ${remaining}s. Please change your approach.` }]
                    };
                }
            }
        } catch (e) {
            process.stderr.write(`[LOOP DETECT] Error: ${(e as Error).message}\n`);
        }

        // [FINOPS] Check budget BEFORE execution (record usage)
        try {
            const { budgetManager } = await import("../utils/finops.js");
            const budgetError = budgetManager.recordUsage(detectedAgent, estimatedTokens);
            if (budgetError) {
                process.stderr.write(`[FINOPS] Budget blocked: ${budgetError}\n`);
                broadcastWS("budget_blocked", { agent: detectedAgent, tool: toolName, error: budgetError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: budgetError }] };
            }
        } catch (e) {
            process.stderr.write(`[FINOPS] Error: ${(e as Error).message}\n`);
        }

        // [LICENSE] Validate write content for license compliance (pre-execution)
        if (toolName === "write_file" || toolName === "replace_text" || toolName === "patch_file") {
            try {
                const { validateLicenseCompliance } = await import("../utils/license-scanner.js");
                const filePath = (maskedArgs.path as string) || "";
                const content = (maskedArgs.content as string) || "";
                if (filePath && content) {
                    const licenseError = validateLicenseCompliance(filePath, content);
                    if (licenseError) {
                        process.stderr.write(`[LICENSE] Blocked: ${licenseError}\n`);
                        broadcastWS("license_violation", { agent: detectedAgent, tool: toolName, error: licenseError, timestamp: new Date().toISOString() });
                        return { isError: true, content: [{ type: "text" as const, text: licenseError }] };
                    }
                }
            } catch (e) {
                process.stderr.write(`[LICENSE] Error: ${(e as Error).message}\n`);
            }
        }

        // [AUTO-ROLLBACK] Prepare snapshot for write operations
        if (toolName === "write_file" || toolName === "replace_text" || toolName === "patch_file") {
            try {
                const { AutoRollbackEngine } = await import("../utils/auto-rollback.js");
                const filePath = (maskedArgs.path as string) || "";
                if (filePath) {
                    AutoRollbackEngine.prepareWrite(filePath, traceId);
                }
            } catch (e) {
                process.stderr.write(`[AUTO-ROLLBACK] Prepare error: ${(e as Error).message}\n`);
            }
        }

        // [HUMAN-IN-LOOP] Check risk gate before execution
        try {
            const { RiskEngine } = await import("atabey/src/modules/engines/risk-engine.js");
            const riskContext = `${toolName} ${JSON.stringify(maskedArgs)}`;
            const riskResult = RiskEngine.assessTaskRisk(riskContext);
            if (riskResult.totalScore > 0) {
                const { checkRiskGate } = await import("../utils/human-in-loop.js");
                const riskReason = riskResult.factors.map(f => f.description).join("; ") || "High-risk operation detected";
                const gateResult = checkRiskGate(traceId, toolName, detectedAgent, riskResult.totalScore, riskReason, maskedArgs);
                if (gateResult?.blocked) {
                    process.stderr.write(`[RISK GATE] Blocked: ${riskReason} (score: ${riskResult.totalScore})\n`);
                    broadcastWS("risk_blocked", { agent: detectedAgent, tool: toolName, riskScore: riskResult.totalScore, traceId, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: gateResult.message! }] };
                }
                if (gateResult?.warning) {
                    process.stderr.write(`[RISK WARNING] ${gateResult.warning}\n`);
                }
            }
        } catch (e) {
            process.stderr.write(`[RISK GATE] Error: ${(e as Error).message}\n`);
        }

        // Execute
        const result = (await handler(PROJECT_ROOT, maskedArgs)) as { isError?: boolean; content: Array<{ type: "text"; text: string }> };

        // [AUTO-ROLLBACK] Check write results for governance violations
        if (toolName === "write_file" || toolName === "replace_text" || toolName === "patch_file") {
            try {
                const filePath = (maskedArgs.path as string) || "";
                const content = (maskedArgs.content as string) || "";
                if (filePath && content) {
                    const { AutoRollbackEngine } = await import("../utils/auto-rollback.js");
                    const { scanFileForViolations } = await import("../utils/rules-engine.js");
                    const violations = scanFileForViolations(filePath, content);
                    if (violations.length > 0) {
                        const violationRecords = violations.map(v => ({
                            rule: v.rule.name,
                            severity: v.rule.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
                            filePath,
                            line: v.line,
                            detail: `Line ${v.line}: ${v.match}`,
                            regenerateInstruction: v.rule.errorMessage,
                        }));
                        const rolledBack = AutoRollbackEngine.validateAndRollback(filePath, content, violationRecords);
                        if (rolledBack) {
                            const instruction = AutoRollbackEngine.buildRegenerateInstruction(rolledBack, toolName);
                            broadcastWS("rollback_violation", { agent: detectedAgent, tool: toolName, violations: rolledBack, timestamp: new Date().toISOString() });
                            return { isError: true, content: [{ type: "text" as const, text: instruction }] };
                        }
                    }
                }
            } catch (e) {
                process.stderr.write(`[AUTO-ROLLBACK] Validate error: ${(e as Error).message}\n`);
            }
        }

        // [DISCIPLINE] Validate response content BEFORE returning to AI
        try {
            const { validateResponse } = await import("../utils/discipline.js");
            const responseError = validateResponse(toolName, result);
            if (responseError) {
                process.stderr.write(`[DISCIPLINE] Response blocked: ${responseError}\n`);
                broadcastWS("discipline_violation", { agent: detectedAgent, tool: toolName, error: responseError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: `[DISCIPLINE] ${responseError}` }] };
            }
        } catch (e) {
            process.stderr.write(`[DISCIPLINE] Response validation error: ${(e as Error).message}\n`);
        }

        // [INJECTION PROTECTION] Sanitize prompt injection attempts in response text
        try {
            const { PromptInjectionProtection } = await import("../utils/prompt-injection.js");
            if (result.content) {
                for (let i = 0; i < result.content.length; i++) {
                    const block = result.content[i];
                    if (block.type === "text" && block.text) {
                        const scan = PromptInjectionProtection.sanitizeResponse(block.text);
                        if (scan.detected) {
                            process.stderr.write(`[INJECTION PROTECTION] Neutralized prompt injection pattern: ${scan.patterns.join(", ")}\n`);
                            Storage.saveLog({
                                agent: detectedAgent,
                                action: "INJECTION_DETECTION",
                                trace_id: traceId || undefined,
                                status: "WARNING",
                                summary: `Prompt injection patterns neutralized: ${scan.patterns.join(", ")}`,
                            });
                            broadcastWS("injection_violation", {
                                agent: detectedAgent,
                                tool: toolName,
                                patterns: scan.patterns,
                                timestamp: new Date().toISOString()
                            });
                            result.content[i] = {
                                ...block,
                                text: scan.sanitized,
                            };
                        }
                    }
                }
            }
        } catch (err) {
            process.stderr.write(`[INJECTION PROTECTION] Error: ${(err as Error).message}\n`);
        }

        // [GOVERNANCE] Validate response against governance rules (post-execution)
        try {
            const { validateResponseAgainstRules } = await import("../utils/rules-engine.js");
            const responseText = result.content?.filter(b => b.type === "text").map(b => b.text).join(" ") || "";
            const govResponseError = validateResponseAgainstRules(toolName, responseText);
            if (govResponseError) {
                process.stderr.write(`[GOVERNANCE] Response violation: ${govResponseError}\n`);
                broadcastWS("governance_violation", { agent: detectedAgent, tool: toolName, error: govResponseError, timestamp: new Date().toISOString() });
            }
        } catch (e) {
            process.stderr.write(`[GOVERNANCE] Response validation error: ${(e as Error).message}\n`);
        }

        // [CONTEXT OPTIMIZER] Check token budget after execution
        try {
            const { checkTokenBudget } = await import("../utils/context-optimizer.js");
            const responseText = result.content?.filter(b => b.type === "text").map(b => b.text).join(" ") || "";
            const budgetError = checkTokenBudget(detectedAgent, toolName, responseText);
            if (budgetError) {
                process.stderr.write(`[TOKEN BUDGET] Warning: ${budgetError}\n`);
                broadcastWS("token_budget_warning", { agent: detectedAgent, tool: toolName, error: budgetError, timestamp: new Date().toISOString() });
            }
        } catch (e) {
            process.stderr.write(`[TOKEN BUDGET] Error: ${(e as Error).message}\n`);
        }

        // [SILENT ROUTER] Build silent context injection
        try {
            const { buildSilentContext } = await import("../utils/silent-router.js");
            if (result.content) {
                for (let i = 0; i < result.content.length; i++) {
                    const block = result.content[i];
                    if (block.type === "text") {
                        result.content[i] = {
                            ...block,
                            text: await buildSilentContext(detectedAgent, toolName, block.text),
                        };
                    }
                }
            }
        } catch (e) {
            process.stderr.write(`[SILENT ROUTER] Context injection error: ${(e as Error).message}\n`);
        }

        // Broadcast to dashboard WS
        broadcastWS("tool_call", { agent: detectedAgent, action: toolName, tokens: estimatedTokens, traceId, timestamp: new Date().toISOString() });

        // [PII/GDPR/KVKK] Mask result before returning to AI
        return maskToolResult(result) as { isError?: boolean; content: Array<{ type: "text"; text: string }> };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Execution failed: ${message}` }] };
    }
}
