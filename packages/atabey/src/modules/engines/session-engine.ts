/**
 * [ENGINE] Session Engine — STEP 0 STARTUP Protocol
 *
 * Implements ATABEY_FULL.md STEP 0:
 * 1. Restore Session Memory & Load Role — read PROJECT_MEMORY.md, DECISIONS.md
 * 2. Read Platform Shim — detect Claude/Gemini/Cursor platform
 * 3. Respect Authority — report to @manager
 *
 * Integrates Token Economy Protocol and Output Flow Standards.
 */

import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../../cli/utils/memory.js";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

export interface SessionContext {
    projectMemory: string;
    decisions: string[];
    activeTraceId: string;
    currentPhase: string;
    platform: string;
    agentState: string;
    tokenBudget: { used: number; limit: number };
}

export interface OutputFlow {
    assumptions: string[];
    problem: string;
    fileTree: string[];
    codeBlocks: number;
    auditLog: string;
    tests: string[];
}

/**
 * Session Engine — manages the STEP 0 startup protocol and enforces
 * token economy and output flow standards on every session.
 */
export class SessionEngine {
    /**
     * STEP 0: STARTUP Protocol — runs at the beginning of every session.
     * Reads PROJECT_MEMORY.md, checks active decisions, detects platform.
     */
    public static async startup(): Promise<SessionContext> {
        const frameworkDir = getFrameworkDir();
        const memoryDir = path.join(frameworkDir, "memory");

        // 1. Read PROJECT_MEMORY.md
        let projectMemory = "";
        const memoryFile = path.join(memoryDir, "PROJECT_MEMORY.md");
        if (fs.existsSync(memoryFile)) {
            projectMemory = fs.readFileSync(memoryFile, "utf8");
        }

        // 2. Read DECISIONS.md for architectural constraints
        let decisions: string[] = [];
        const decisionsFile = path.join(memoryDir, "DECISIONS.md");
        if (fs.existsSync(decisionsFile)) {
            const content = fs.readFileSync(decisionsFile, "utf8");
            decisions = content.split("\n").filter(l => l.startsWith("- **") || l.startsWith("- "));
        }

        // 3. Detect active session state
        const activeTraceId = AtabeyStorage.getMetadata("traceId") || "N/A";
        const currentPhase = AtabeyStorage.getMetadata("phase") || "PHASE_0";
        const platform = process.env.ATABEY_PLATFORM || "unknown";

        // 4. Get agent state
        const agents = AtabeyStorage.getAllAgents();
        const managerState = agents.find(a => a.name === "@manager" || a.name === "manager");

        // 5. Check token budget from storage metadata
        const tokenUsed = parseInt(AtabeyStorage.getMetadata("tokenUsed") || "0", 10);
        const tokenLimit = parseInt(AtabeyStorage.getMetadata("tokenLimit") || "100000", 10);
        const tokenBudget = { used: tokenUsed, limit: tokenLimit };

        logger.info(`[SESSION] STEP 0 STARTUP — Trace: ${activeTraceId}, Phase: ${currentPhase}, Platform: ${platform}`);

        return {
            projectMemory,
            decisions,
            activeTraceId,
            currentPhase,
            platform,
            agentState: managerState?.state || "READY",
            tokenBudget,
        };
    }

    /**
     * Token Economy Protocol — enforces:
     * - Search before read (never read_file entire directories)
     * - Surgical operations (replace instead of write)
     * - Output conciseness (minimum required data)
     * - Context compaction (retrieve only relevant history)
     */
    public static async checkTokenEconomy(
        operationType: "read" | "write" | "replace" | "search",
        estimatedTokens: number
    ): Promise<{ allowed: boolean; warning?: string }> {
        const context = await SessionEngine.startup();

        if (operationType === "read" && estimatedTokens > 5000) {
            return {
                allowed: false,
                warning: `[TOKEN ECONOMY] Read operation too large (${estimatedTokens} tokens). Search before read.`
            };
        }

        if (operationType === "write" && estimatedTokens > 20000) {
            return {
                allowed: true,
                warning: `[TOKEN ECONOMY] Large write (${estimatedTokens} tokens). Consider surgical replace instead.`
            };
        }

        if (context.tokenBudget.used > context.tokenBudget.limit) {
            return {
                allowed: false,
                warning: `[TOKEN ECONOMY] Token budget exceeded (${context.tokenBudget.used}/${context.tokenBudget.limit}). Compact context before proceeding.`
            };
        }

        return { allowed: true };
    }

    /**
     * Output Flow Standard — validates that agent output follows the
     * mandatory format: Assumptions, Problem, File Tree, Code, Tests, Audit Log.
     */
    public static validateOutputFlow(output: string): { passed: boolean; missing: string[] } {
        const missing: string[] = [];
        const outputUpper = output.toUpperCase();

        if (!outputUpper.includes("ASSUMPTION")) {
            missing.push("Assumptions section — state all assumptions made");
        }
        if (!outputUpper.includes("PROBLEM")) {
            missing.push("Problem section — what is being built and why (max 2-3 sentences)");
        }
        if (!outputUpper.includes("FILE TREE") && !outputUpper.includes("FILE")) {
            missing.push("File Tree section — complete folder and file structure");
        }
        if (!outputUpper.includes("AUDIT") && !outputUpper.includes("LOG")) {
            missing.push("Audit Logging section — how changes are logged");
        }
        if (!outputUpper.includes("TEST")) {
            missing.push("Tests section — test file for every service and utility");
        }

        return {
            passed: missing.length === 0,
            missing,
        };
    }

    /**
     * Checks session compliance with STEP 0 rules.
     * Logs a warning if rules are not followed.
     */
    public static async checkSessionCompliance(): Promise<{
        compliant: boolean;
        warnings: string[];
    }> {
        const context = await SessionEngine.startup();
        const warnings: string[] = [];

        if (!context.projectMemory) {
            warnings.push("PROJECT_MEMORY.md not found. Run STEP 0: Restore Session Memory.");
        }
        if (context.activeTraceId === "N/A") {
            warnings.push("No active Trace ID. Generate one with `atabey trace:new`.");
        }
        if (!context.decisions.length) {
            warnings.push("DECISIONS.md is empty or missing. Architectural decisions should be documented.");
        }

        return {
            compliant: warnings.length === 0,
            warnings,
        };
    }
}
