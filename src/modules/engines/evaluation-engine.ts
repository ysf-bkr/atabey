import fs from "fs";
import path from "path";
import { scanProjectCompliance } from "../../cli/utils/compliance.js";
import { getFrameworkDir } from "../../cli/utils/memory.js";
import { appendFile, ensureDir, runCommandQuiet, writeTextFile } from "../../shared/fs.js";
import { logger } from "../../shared/logger.js";
import { asTraceID } from "../../shared/types.js";
import { EvaluationResult } from "./types.js";

export class EvaluationEngine {
    /**
     * Evaluates a completed task, calculates a score, and updates Specialty Memory if needed.
     */
    public static evaluateTask(traceIdStr: string, agentName: string, durationMs: number): EvaluationResult {
        const traceId = asTraceID(traceIdStr);
        logger.debug(`Starting evaluation for Trace ${traceId} by ${agentName}`);

        let score = 100;
        const metrics = {
            compilation: true,
            lint: true,
            tests: true,
            compliance: 0
        };

        const projectRoot = process.cwd();

        // 1. Compliance Check (AST-based discipline check)
        try {
            const issues = scanProjectCompliance("src"); // Defaulting to src/ for now
            metrics.compliance = issues.length;
            if (issues.length > 0) {
                score -= Math.min(issues.length * 5, 40); // Max 40 points deduction for compliance
                this.updateSpecialtyMemory(agentName, "Compliance Violations Detected: Ensure strict adherence to zero-any, zero-console.log policies.");
            }
        } catch (e) {
            logger.debug("Compliance check failed during evaluation", e);
        }

        // 2. Compilation Check
        try {
            if (fs.existsSync(path.join(projectRoot, "tsconfig.json"))) {
                runCommandQuiet("npx", ["tsc", "--noEmit"], projectRoot);
            }
        } catch {
            metrics.compilation = false;
            score -= 20;
            this.updateSpecialtyMemory(agentName, "Compilation Error: Always run 'npx tsc --noEmit' to verify type safety before completing a task.");
        }

        // 3. Lint Check
        try {
            if (fs.existsSync(path.join(projectRoot, "eslint.config.js"))) {
                runCommandQuiet("npx", ["eslint", ".", "--max-warnings", "0"], projectRoot);
            }
        } catch {
            metrics.lint = false;
            score -= 10;
        }

        // 4. Test Check (Assuming vitest is standard for this framework)
        try {
            if (fs.existsSync(path.join(projectRoot, "vitest.config.ts"))) {
                runCommandQuiet("npx", ["vitest", "run", "--passWithNoTests"], projectRoot);
            }
        } catch {
            metrics.tests = false;
            score -= 20;
            this.updateSpecialtyMemory(agentName, "Test Failure: Ensure all unit tests pass before marking a task as COMPLETED.");
        }

        // 5. Efficiency Check
        if (durationMs > 120000) { // If task took more than 2 minutes
            score -= 10;
        }

        const result: EvaluationResult = {
            traceId,
            agent: agentName.replace("@", ""),
            score: Math.max(0, score),
            metrics,
            durationMs,
            timestamp: new Date().toISOString()
        };

        logger.debug(`Evaluation completed for ${agentName}: Score ${result.score}/100`);
        return result;
    }

    /**
     * Appends learned lessons to the agent's specialty memory.
     */
    private static updateSpecialtyMemory(agentName: string, lesson: string) {
        const cleanName = agentName.replace("@", "");
        const fwDir = getFrameworkDir();
        const specialtiesDir = path.join(fwDir, "memory", "specialties");

        ensureDir(specialtiesDir);

        const filePath = path.join(specialtiesDir, `${cleanName}.md`);
        const timestamp = new Date().toISOString().split("T")[0];
        const entry = `- **[${timestamp}]**: ${lesson}\n`;

        if (!fs.existsSync(filePath)) {
            writeTextFile(filePath, `# Learned Conventions for @${cleanName}\n\n`);
        }

        // Avoid duplicate lessons on the same day
        const currentContent = fs.readFileSync(filePath, "utf8");
        if (!currentContent.includes(lesson)) {
            appendFile(filePath, entry);
        }
    }

    // ─── Auto-Learning Loop disabled ─────────────────────────────────────────
    // LLMGateway was removed. AI-powered meta-learning is handled by the AI
    // interface (Claude Code / Gemini CLI / Cursor) directly.
    // Specialty memory can still be updated via other evaluation triggers.
}
