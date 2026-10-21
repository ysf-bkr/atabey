import crypto from "crypto";
import fs from "fs";
import path from "path";
import { generateULID } from "atabey-shared/time.js";
import { logger } from "../../shared/logger.js";
import { maskToolArgs, maskToolResult } from "../../shared/pii.js";
import { Storage } from "../../shared/storage.js";
import { TOOLS, toolHandlers, toolSchemas } from "../tools/index.js";

/** Tracks SHA-256 hashes of files last read or written through Atabey MCP. */
const auditedFileHashes = new Map<string, string>();

export function recordAuditedFileHash(filePath: string): void {
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const digest = crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
            auditedFileHashes.set(path.resolve(filePath), digest);
        }
    } catch (err) {
        logger.debug(`recordAuditedFileHash: failed to hash ${filePath}`, err);
    }
}

export function clearAuditedFileHashes(): void {
    auditedFileHashes.clear();
}

/**
 * Detects files that were previously read/written via Atabey MCP and subsequently
 * modified out-of-band by a host IDE/CLI native tool, scanning them against Atabey
 * governance rules.
 */
export async function scanUnauditedWorkspaceEdits(projectRoot: string): Promise<{
    unauditedFiles: string[];
    violations: Array<{ filePath: string; rule: string; line: number; detail: string }>;
}> {
    const unauditedFiles: string[] = [];
    const violations: Array<{ filePath: string; rule: string; line: number; detail: string }> = [];
    const { scanFileForViolations } = await import("../utils/rules-engine.js");

    for (const [absPath, recordedHash] of auditedFileHashes.entries()) {
        if (!absPath.startsWith(path.resolve(projectRoot))) continue;
        if (!fs.existsSync(absPath)) continue;
        try {
            const buf = fs.readFileSync(absPath);
            const currentHash = crypto.createHash("sha256").update(buf).digest("hex");
            if (currentHash !== recordedHash) {
                const relPath = path.relative(projectRoot, absPath);
                unauditedFiles.push(relPath);
                const fileViolations = scanFileForViolations(relPath, buf.toString("utf8"), { includeBypassable: false });
                for (const v of fileViolations) {
                    violations.push({
                        filePath: relPath,
                        rule: v.rule.name,
                        line: v.line,
                        detail: `Line ${v.line}: ${v.match} (${v.rule.errorMessage})`,
                    });
                }
                // Update hash after scanning unless violations exist
                if (fileViolations.length === 0) {
                    auditedFileHashes.set(absPath, currentHash);
                }
            }
        } catch (err) {
            logger.debug(`scanUnauditedWorkspaceEdits: failed to scan ${absPath}`, err);
        }
    }

    return { unauditedFiles, violations };
}

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

/** Mutating tools whose arguments carry file write targets. */
const WRITE_TOOLS = ["write_file", "replace_text", "patch_file", "batch_surgical_edit"];

/**
 * Resolves the (de-duplicated) write target paths for a mutating tool call
 * from its raw arguments — shared by the pre-write snapshot and the
 * post-write violation scan so both always inspect the same file set.
 */
function resolveWriteTargets(toolName: string, rawArgs: Record<string, unknown>): string[] {
    const targets: string[] = [];
    if (toolName === "batch_surgical_edit") {
        const edits = (rawArgs.edits as Array<{ path: string }>) || [];
        for (const edit of edits) {
            if (edit?.path && !targets.includes(edit.path)) {
                targets.push(edit.path);
            }
        }
    } else {
        const p = (rawArgs.path as string) || "";
        if (p) targets.push(p);
    }
    return targets;
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

        const rawArgs = args || {};
        // [PII/GDPR/KVKK] Mask args for audit/telemetry/logging only, NOT for mutating disk execution
        const maskedArgs = maskToolArgs(rawArgs);

        // [AGENT RESOLUTION] Determine active or detected agent persona upfront
        const traceId = generateULID();
        let detectedAgent = clientAgent;
        try {
            const { resolveActiveAgent } = await import("../utils/permissions.js");
            const { resolveFrameworkDir } = await import("../utils/security.js");
            const frameworkDir = resolveFrameworkDir(PROJECT_ROOT);
            const explicit = resolveActiveAgent(frameworkDir);
            if (explicit) {
                detectedAgent = explicit;
            } else {
                const { detectAgent, stealthNotify } = await import("../utils/silent-router.js");
                const routed = detectAgent(toolName, maskedArgs);
                if (routed && routed !== clientAgent) {
                    detectedAgent = routed;
                    stealthNotify(detectedAgent, toolName, `Silently routed from ${clientAgent}`);
                    logger.info(`[SILENT ROUTER] ${toolName} → ${detectedAgent} (from ${clientAgent})`);
                }
            }
        } catch (err) {
            logger.debug("Agent resolution failed; falling back to client agent", err);
        }
        const activeAgent = detectedAgent;

        // [OUT-OF-BAND BYPASS GUARD] Detect files modified via host native tools bypassing Atabey MCP
        if (process.env.ATABEY_ENFORCE_UNAUDITED_WRITES !== "false") {
            const unaudited = await scanUnauditedWorkspaceEdits(PROJECT_ROOT);
            if (unaudited.violations.length > 0) {
                const summary = unaudited.violations.map(v => `${v.filePath}:${v.line} [${v.rule}] ${v.detail}`).join("; ");
                const msg = `[GOVERNANCE BYPASS DETECTED] Out-of-band native file modification violated constitutional rules: ${summary}`;
                logger.warn(msg);
                broadcastWS("governance_violation", { agent: activeAgent, tool: toolName, error: msg, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: msg }] };
            }
        }

        // [POLICY GATE] Hard deny for mutating tools (path safety, recon, protected paths)
        // Phase 0 enterprise foundation — every mutating tool must pass this gate.
        try {
            const { denyIfMutatingBlocked } = await import("../utils/policy-gate.js");
            const policyDenial = denyIfMutatingBlocked({
                projectRoot: PROJECT_ROOT,
                tool: toolName,
                args: rawArgs,
                clientAgent: activeAgent,
            });
            if (policyDenial) {
                logger.warn(`[POLICY_GATE] Blocked: ${policyDenial}`);
                try {
                    Storage.saveLog({
                        agent: clientAgent,
                        action: "POLICY_GATE_DENY",
                        status: "BLOCKED",
                        summary: policyDenial,
                        findings: toolName,
                    });
                } catch (err) {
                    logger.debug("POLICY_GATE_DENY log persistence failed (non-fatal)", err);
                }
                broadcastWS("policy_gate_denied", {
                    agent: clientAgent,
                    tool: toolName,
                    error: policyDenial,
                    timestamp: new Date().toISOString(),
                });
                return { isError: true, content: [{ type: "text" as const, text: policyDenial }] };
            }
        } catch (e) {
            // FAIL-CLOSED: a security control that cannot run must deny, not silently pass.
            const message = `[POLICY_GATE] Enforcement failed: ${(e as Error).message}. Operation denied (fail-closed).`;
            logger.error(message);
            broadcastWS("policy_gate_denied", { agent: clientAgent, tool: toolName, error: message, timestamp: new Date().toISOString() });
            return { isError: true, content: [{ type: "text" as const, text: message }] };
        }

        // [PERMISSION MATRIX] Universal file/directory RBAC check across all path-bearing tools
        try {
            const { enforceToolPermissionMatrix } = await import("../utils/permissions.js");
            enforceToolPermissionMatrix(PROJECT_ROOT, toolName, rawArgs, activeAgent);
        } catch (e) {
            const message = `[RBAC] ${(e as Error).message}`;
            logger.warn(message);
            broadcastWS("governance_violation", { agent: activeAgent, tool: toolName, error: message, timestamp: new Date().toISOString() });
            return { isError: true, content: [{ type: "text" as const, text: message }] };
        }

        // [INPUT INJECTION SCAN] Inspect incoming task descriptions, arguments, and written content
        try {
            const { PromptInjectionProtection } = await import("../utils/prompt-injection.js");
            const textToScan: string[] = [];
            for (const key of ["task", "prompt", "message", "description", "query", "command"]) {
                const val = rawArgs[key];
                if (typeof val === "string" && val.trim()) textToScan.push(val);
            }
            for (const key of ["content", "newText", "patch"]) {
                const val = rawArgs[key];
                if (typeof val === "string" && val.trim()) textToScan.push(val);
            }
            if (Array.isArray(rawArgs.edits)) {
                for (const edit of rawArgs.edits) {
                    if (edit && typeof edit === "object") {
                        const rec = edit as Record<string, unknown>;
                        if (typeof rec.replacement === "string") textToScan.push(rec.replacement);
                        if (typeof rec.content === "string") textToScan.push(rec.content);
                    }
                }
            }

            for (const sample of textToScan) {
                const scan = PromptInjectionProtection.scanPayload(sample);
                if (scan.detected) {
                    const patternList = scan.patterns.join(", ");
                    const msg = `[INJECTION_DETECTION] Blocked prompt injection in input/content payload: ${patternList}`;
                    logger.warn(msg);
                    try {
                        Storage.saveLog({
                            agent: clientAgent,
                            action: "INJECTION_BLOCKED",
                            status: "BLOCKED",
                            summary: msg,
                            findings: toolName,
                        });
                    } catch (err) {
                        logger.debug("INJECTION_BLOCKED log persistence failed (non-fatal)", err);
                    }
                    broadcastWS("injection_violation", {
                        agent: clientAgent,
                        tool: toolName,
                        patterns: scan.patterns,
                        timestamp: new Date().toISOString(),
                    });
                    return { isError: true, content: [{ type: "text" as const, text: msg }] };
                }
            }
        } catch (e) {
            logger.error(`[INJECTION PROTECTION] Input scan error: ${(e as Error).message}`);
        }

        // [TOKEN ECONOMY] Count input tokens via cl100k BPE tokenizer
        const argsJson = JSON.stringify(maskedArgs);
        let estimatedTokens = Math.ceil(argsJson.length / 4);
        try {
            const { Metrics } = await import("../utils/metrics.js");
            estimatedTokens = Metrics.estimateTokens(argsJson);
        } catch (e) {
            logger.error(`[METRICS] Error: ${(e as Error).message}`);
        }

        // [GOVERNANCE] Validate arguments against governance rules (pre-execution)
        try {
            const { validateArgsAgainstRules } = await import("../utils/rules-engine.js");
            const governanceError = validateArgsAgainstRules(toolName, maskedArgs);
            if (governanceError) {
                logger.warn(`[GOVERNANCE] Blocked: ${governanceError}`);
                broadcastWS("governance_violation", { agent: clientAgent, tool: toolName, error: governanceError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: governanceError }] };
            }
        } catch (e) {
            const message = `[GOVERNANCE] Rule enforcement failed: ${(e as Error).message}. Operation denied (fail-closed).`;
            logger.error(message);
            broadcastWS("governance_violation", { agent: clientAgent, tool: toolName, error: message, timestamp: new Date().toISOString() });
            return { isError: true, content: [{ type: "text" as const, text: message }] };
        }

        // [DISCIPLINE] Enforce AI discipline at tool level BEFORE execution
        try {
            const { enforceDiscipline } = await import("../utils/discipline.js");
            const disciplineError = await enforceDiscipline(clientAgent, toolName, maskedArgs);
            if (disciplineError) {
                logger.warn(`[DISCIPLINE] Blocked: ${disciplineError}`);
                broadcastWS("discipline_violation", { agent: clientAgent, tool: toolName, error: disciplineError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: `[DISCIPLINE] ${disciplineError}` }] };
            }
        } catch (e) {
            const message = `[DISCIPLINE] Enforcement failed: ${(e as Error).message}. Operation denied (fail-closed).`;
            logger.error(message);
            broadcastWS("discipline_violation", { agent: clientAgent, tool: toolName, error: message, timestamp: new Date().toISOString() });
            return { isError: true, content: [{ type: "text" as const, text: message }] };
        }

        // [TOKEN BUDGET] Pre-execution gate (opt-in hard enforcement)
        try {
            const { enforceTokenBudgetPreCall } = await import("../utils/context-optimizer.js");
            const budgetGate = enforceTokenBudgetPreCall(clientAgent, toolName);
            if (budgetGate) {
                logger.warn(`[TOKEN BUDGET] Blocked: ${budgetGate}`);
                broadcastWS("token_budget_blocked", { agent: clientAgent, tool: toolName, error: budgetGate, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: budgetGate }] };
            }
        } catch (e) {
            logger.error(`[TOKEN BUDGET] Pre-call gate error: ${(e as Error).message}`);
        }

        // [SILENT ROUTER] Context already resolved upfront as activeAgent (detectedAgent)

        // [CRUD GOVERNANCE] Verify agent permissions for high-risk operations
        try {
            const { GovernanceEngine } = await import("atabey/src/modules/engines/crud-governance.js");
            const taskStr = toolName === "run_shell_command" ? (maskedArgs.command as string || "") : `${toolName} ${argsJson}`;
            const operation = GovernanceEngine.classifyTask(taskStr);
            if (operation) {
                const decision = await GovernanceEngine.evaluate(detectedAgent, operation, taskStr, traceId);
                if (decision.requiresApproval) {
                    logger.warn(`[GOVERNANCE] Blocked: ${decision.reason}`);
                    broadcastWS("governance_violation", { agent: detectedAgent, tool: toolName, error: decision.reason, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: `[GOVERNANCE] Blocked: ${decision.reason}` }] };
                }
            }
        } catch (e) {
            const message = `[GOVERNANCE] CRUD authorization failed: ${(e as Error).message}. Operation denied (fail-closed).`;
            logger.error(message);
            broadcastWS("governance_violation", { agent: detectedAgent, tool: toolName, error: message, timestamp: new Date().toISOString() });
            return { isError: true, content: [{ type: "text" as const, text: message }] };
        }

        // [LOOP DETECTION] Check for infinite loop patterns
        try {
            const { recordAndCheck } = await import("../utils/loop-detector.js");
            const loopAlert = recordAndCheck(detectedAgent, toolName, maskedArgs);
            if (loopAlert) {
                logger.warn(`[LOOP DETECT] ${loopAlert.type}: ${loopAlert.detail}`);
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
            logger.error(`[LOOP DETECT] Error: ${(e as Error).message}`);
        }

        // [AUTO-ROLLBACK] Prepare snapshot for write operations
        if (WRITE_TOOLS.includes(toolName)) {
            try {
                const { AutoRollbackEngine, setAutoRollbackRoot } = await import("../utils/auto-rollback.js");
                setAutoRollbackRoot(PROJECT_ROOT);
                for (const target of resolveWriteTargets(toolName, rawArgs)) {
                    const resolved = path.isAbsolute(target) ? target : path.resolve(PROJECT_ROOT, target);
                    AutoRollbackEngine.prepareWrite(resolved, traceId);
                }
            } catch (e) {
                logger.error(`[AUTO-ROLLBACK] Prepare error: ${(e as Error).message}`);
            }
        }

        // [HUMAN-IN-LOOP] Check risk gate before execution
        try {
            const { RiskEngine } = await import("atabey/src/modules/engines/risk-engine.js");
            const riskContext = `${toolName} ${JSON.stringify(maskedArgs)}`;
            let riskResult = RiskEngine.assessTaskRisk(riskContext);

            // Augment with file-blast-radius analysis for write tools (deletion/bulk risk).
            if (WRITE_TOOLS.includes(toolName)) {
                const operation = toolName === "write_file" ? "write" : toolName === "replace_text" ? "replace" : "patch";
                const filePath = typeof rawArgs.path === "string" ? rawArgs.path : "";
                const affectedFileCount =
                    toolName === "batch_surgical_edit" && Array.isArray(rawArgs.edits)
                        ? (rawArgs.edits as unknown[]).length
                        : undefined;
                const changeResult = RiskEngine.assessChangeRisk(filePath, operation, { affectedFileCount });
                if (changeResult.totalScore > riskResult.totalScore) {
                    riskResult = changeResult;
                }
            }

            if (riskResult.totalScore > 0) {
                const { checkRiskGate } = await import("../utils/human-in-loop.js");
                const riskReason = riskResult.factors.map(f => f.description).join("; ") || "High-risk operation detected";
                const gateResult = checkRiskGate(traceId, toolName, detectedAgent, riskResult.totalScore, riskReason, maskedArgs);
                if (gateResult?.blocked) {
                    logger.warn(`[RISK GATE] Blocked: ${riskReason} (score: ${riskResult.totalScore})`);
                    broadcastWS("risk_blocked", { agent: detectedAgent, tool: toolName, riskScore: riskResult.totalScore, traceId, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: gateResult.message! }] };
                }
                if (gateResult?.warning) {
                    logger.warn(`[RISK WARNING] ${gateResult.warning}`);
                }
            }
        } catch (e) {
            const message = `[RISK GATE] Assessment failed: ${(e as Error).message}. Operation denied (fail-closed).`;
            logger.error(message);
            broadcastWS("risk_blocked", { agent: detectedAgent, tool: toolName, traceId, error: message, timestamp: new Date().toISOString() });
            return { isError: true, content: [{ type: "text" as const, text: message }] };
        }

        // Execute handler with raw arguments so code/file content is not corrupted by PII masking
        const result = (await handler(PROJECT_ROOT, rawArgs)) as { isError?: boolean; content: Array<{ type: "text"; text: string }> };

        // [AUTO-ROLLBACK] Check write results for governance violations
        if (WRITE_TOOLS.includes(toolName) && !result.isError) {
            try {
                const { AutoRollbackEngine } = await import("../utils/auto-rollback.js");
                const { scanFileForViolations } = await import("../utils/rules-engine.js");
                const fs = await import("fs");

                const targets = resolveWriteTargets(toolName, rawArgs);
                const resolvedTargets = targets.map(t => path.isAbsolute(t) ? t : path.resolve(PROJECT_ROOT, t));
                const allViolations: Array<{
                    rule: string;
                    severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
                    filePath: string;
                    line: number;
                    detail: string;
                    regenerateInstruction: string;
                }> = [];

                for (let i = 0; i < targets.length; i++) {
                    const resolved = resolvedTargets[i];
                    if (!fs.existsSync(resolved)) continue;
                    const content = fs.readFileSync(resolved, "utf8");
                    const violations = scanFileForViolations(targets[i], content, { includeBypassable: false });
                    for (const v of violations) {
                        allViolations.push({
                            rule: v.rule.name,
                            severity: v.rule.priority as "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
                            filePath: targets[i],
                            line: v.line,
                            detail: `Line ${v.line}: ${v.match}`,
                            regenerateInstruction: v.rule.errorMessage,
                        });
                    }
                }

                if (allViolations.length > 0) {
                    // Atomic multi-file rollback: restore EVERY file touched by this
                    // call (not only the violating ones), so a batch edit never leaves
                    // the project in a half-changed state.
                    const restored = AutoRollbackEngine.restoreFiles(resolvedTargets);
                    const instruction = AutoRollbackEngine.buildRegenerateInstruction(allViolations, toolName);
                    broadcastWS("rollback_violation", { agent: detectedAgent, tool: toolName, violations: allViolations, restored, timestamp: new Date().toISOString() });
                    return { isError: true, content: [{ type: "text" as const, text: instruction }] };
                }

                for (const resolved of resolvedTargets) {
                    recordAuditedFileHash(resolved);
                }
            } catch (e) {
                logger.error(`[AUTO-ROLLBACK] Validate error: ${(e as Error).message}`);
            }
        } else if (toolName === "read_file" && !result.isError && typeof rawArgs.path === "string") {
            const resolvedRead = path.isAbsolute(rawArgs.path) ? rawArgs.path : path.resolve(PROJECT_ROOT, rawArgs.path);
            recordAuditedFileHash(resolvedRead);
        }

        // [DISCIPLINE] Validate response content BEFORE returning to AI
        try {
            const { validateResponse } = await import("../utils/discipline.js");
            const responseError = validateResponse(toolName, result);
            if (responseError) {
                logger.warn(`[DISCIPLINE] Response blocked: ${responseError}`);
                broadcastWS("discipline_violation", { agent: detectedAgent, tool: toolName, error: responseError, timestamp: new Date().toISOString() });
                return { isError: true, content: [{ type: "text" as const, text: `[DISCIPLINE] ${responseError}` }] };
            }
        } catch (e) {
            logger.error(`[DISCIPLINE] Response validation error: ${(e as Error).message}`);
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
                            logger.warn(`[INJECTION PROTECTION] Neutralized prompt injection pattern: ${scan.patterns.join(", ")}`);
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
            logger.error(`[INJECTION PROTECTION] Error: ${(err as Error).message}`);
        }

        // [GOVERNANCE] Validate response against governance rules (post-execution)
        try {
            const { validateResponseAgainstRules } = await import("../utils/rules-engine.js");
            const responseText = result.content?.filter(b => b.type === "text").map(b => b.text).join(" ") || "";
            const govResponseError = validateResponseAgainstRules(toolName, responseText);
            if (govResponseError) {
                logger.warn(`[GOVERNANCE] Response violation: ${govResponseError}`);
                broadcastWS("governance_violation", { agent: detectedAgent, tool: toolName, error: govResponseError, timestamp: new Date().toISOString() });
            }
        } catch (e) {
            logger.error(`[GOVERNANCE] Response validation error: ${(e as Error).message}`);
        }

        // [CONTEXT OPTIMIZER] Check token budget after execution
        try {
            const { checkTokenBudget, smartTruncateFile, detectProvider, isTokenBudgetEnforced } = await import("../utils/context-optimizer.js");
            const responseText = result.content?.filter(b => b.type === "text").map(b => b.text).join(" ") || "";
            const budgetError = checkTokenBudget(detectedAgent, toolName, responseText);
            if (budgetError) {
                logger.warn(`[TOKEN BUDGET] Warning: ${budgetError}`);
                broadcastWS("token_budget_warning", { agent: detectedAgent, tool: toolName, error: budgetError, timestamp: new Date().toISOString() });

                // If read_file exceeds token budget, apply smart truncation to prevent LLM context overflow
                if (toolName === "read_file" && rawArgs.path && typeof rawArgs.path === "string") {
                    const provider = detectProvider(detectedAgent);
                    for (let i = 0; i < result.content.length; i++) {
                        if (result.content[i].type === "text" && result.content[i].text) {
                            result.content[i].text = smartTruncateFile(result.content[i].text, rawArgs.path, provider);
                        }
                    }
                } else if (isTokenBudgetEnforced()) {
                    // Hard enforcement: refuse to deliver an over-budget payload to the model.
                    return { isError: true, content: [{ type: "text" as const, text: budgetError }] };
                }
            }
        } catch (e) {
            logger.error(`[TOKEN BUDGET] Error: ${(e as Error).message}`);
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
            logger.error(`[SILENT ROUTER] Context injection error: ${(e as Error).message}`);
        }

        // [SECRET LEAK GUARD] Detect + REDACT leaked credentials in tool output
        try {
            const { scanForSecrets, redactSecrets } = await import("atabey-shared/secrets.js");
            const scanText = result.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
            const leaks = scanForSecrets(scanText);
            if (leaks.length > 0) {
                const ruleIds = [...new Set(leaks.map(l => l.ruleId))].join(", ");
                logger.warn(`[SECRET LEAK] ${leaks.length} potential secret(s) in ${toolName} output: ${ruleIds}`);
                try {
                    Storage.saveLog({
                        agent: detectedAgent,
                        action: "SECRET_LEAK_DETECTED",
                        trace_id: traceId || undefined,
                        status: "WARNING",
                        summary: `Potential secret leak(s) in tool output: ${ruleIds}`,
                        findings: toolName,
                    });
                } catch (err) {
                    logger.debug("SECRET_LEAK_DETECTED log persistence failed (non-fatal)", err);
                }
                broadcastWS("secret_leak", { agent: detectedAgent, tool: toolName, rules: ruleIds, count: leaks.length, timestamp: new Date().toISOString() });
                // Redact before the output reaches the AI.
                if (result.content) {
                    for (let i = 0; i < result.content.length; i++) {
                        const block = result.content[i];
                        if (block.type === "text" && block.text) {
                            result.content[i] = { ...block, text: redactSecrets(block.text) };
                        }
                    }
                }
            }
        } catch (e) {
            logger.error(`[SECRET LEAK] Scan error: ${(e as Error).message}`);
        }

        // [TOKENS] Record accurate input + output token breakdown for token-economy accounting
        try {
            const { Metrics } = await import("../utils/metrics.js");
            const finalResponseText = result.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
            const usage = Metrics.recordToolCallUsage(
                PROJECT_ROOT,
                detectedAgent,
                toolName,
                maskedArgs,
                finalResponseText,
                traceId,
            );
            estimatedTokens = usage.totalTokens;
        } catch (e) {
            logger.error(`[METRICS] Token accounting error: ${(e as Error).message}`);
        }

        // Broadcast to live WS clients (no-op when no UI is attached)
        broadcastWS("tool_call", { agent: detectedAgent, action: toolName, tokens: estimatedTokens, traceId, timestamp: new Date().toISOString() });

        // [PII/GDPR/KVKK] Mask result before returning to AI — except for
        // technical content (tests/docs/examples) where masking would corrupt it.
        let bypassPii = false;
        try {
            const { shouldBypassPiiMaskingForPath } = await import("atabey-shared/pii.js");
            const piiPath = typeof rawArgs.path === "string" ? rawArgs.path
                : typeof rawArgs.file === "string" ? rawArgs.file : undefined;
            bypassPii = piiPath !== undefined && shouldBypassPiiMaskingForPath(piiPath);
        } catch (err) {
            logger.debug("PII bypass path check failed; keeping masking enabled (fail-safe)", err);
        }
        return (bypassPii ? result : maskToolResult(result)) as { isError?: boolean; content: Array<{ type: "text"; text: string }> };
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error occurred";
        return { isError: true, content: [{ type: "text" as const, text: `[ERROR] Execution failed: ${message}` }] };
    }
}
