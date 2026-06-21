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
     * Evaluates a completed task, calculates a score, and updates Specialty Memory.
     * Saves lessons from both failures AND successes.
     */
    public static evaluateTask(traceIdStr: string, agentName: string, durationMs: number, taskDescription?: string): EvaluationResult {
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
        const lessons: string[] = [];

        // 1. Compliance Check (AST-based discipline check)
        try {
            const issues = scanProjectCompliance("src");
            metrics.compliance = issues.length;
            if (issues.length > 0) {
                score -= Math.min(issues.length * 5, 40);
                lessons.push("Compliance Violations Detected: Ensure strict adherence to zero-any, zero-console.log policies.");
            } else {
                lessons.push("Compliance check passed: No any types or console.log violations found.");
            }
        } catch (e) {
            logger.debug("Compliance check failed during evaluation", e);
        }

        // 2. Compilation Check
        try {
            if (fs.existsSync(path.join(projectRoot, "tsconfig.json"))) {
                runCommandQuiet("npx", ["tsc", "--noEmit"], projectRoot);
                lessons.push("TypeScript compilation succeeded. Project is type-safe.");
            }
        } catch {
            metrics.compilation = false;
            score -= 20;
            lessons.push("Compilation Error: Always run 'npx tsc --noEmit' to verify type safety before completing a task.");
        }

        // 3. Lint Check
        try {
            if (fs.existsSync(path.join(projectRoot, "eslint.config.js"))) {
                runCommandQuiet("npx", ["eslint", ".", "--max-warnings", "0"], projectRoot);
                lessons.push("Lint check passed. Code follows project style guidelines.");
            }
        } catch {
            metrics.lint = false;
            score -= 10;
        }

        // 4. Test Check
        try {
            if (fs.existsSync(path.join(projectRoot, "vitest.config.ts"))) {
                runCommandQuiet("npx", ["vitest", "run", "--passWithNoTests"], projectRoot);
                lessons.push("All tests passed. Changes are verified.");
            }
        } catch {
            metrics.tests = false;
            score -= 20;
            lessons.push("Test Failure: Ensure all unit tests pass before marking a task as COMPLETED.");
        }

        // 5. Efficiency Check
        if (durationMs > 120000) {
            score -= 10;
            lessons.push("Task took longer than 2 minutes. Consider breaking large tasks into smaller steps.");
        } else if (score >= 80) {
            lessons.push("Task completed efficiently within expected timeframe.");
        }

        // 6. Success Lesson — if score is high and no critical errors
        if (score >= 80 && taskDescription) {
            const successLesson = this.extractSuccessLesson(agentName, taskDescription);
            if (successLesson) {
                lessons.push(successLesson);
            }
        }

        // Save all lessons to specialty memory
        for (const lesson of lessons) {
            this.updateSpecialtyMemory(agentName, lesson);
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

    private static extractSuccessLesson(agentName: string, taskDescription: string): string | null {
        const patterns: Array<{ keywords: string[]; category: string }> = [
            { keywords: ["api", "endpoint", "route", "rest"], category: "REST API pattern" },
            { keywords: ["auth", "login", "jwt", "token"], category: "Authentication/authorization/JWT pattern" },
            { keywords: ["test", "spec", "vitest"], category: "Test-driven development approach" },
            { keywords: ["migration", "schema", "database", "sql"], category: "Database schema/migration pattern" },
            { keywords: ["component", "react", "ui", "page"], category: "UI component design pattern" },
            { keywords: ["middleware", "guard", "interceptor"], category: "Middleware/guard pipeline pattern" },
            { keywords: ["service", "repository", "inject"], category: "Service/repository architecture pattern" },
            { keywords: ["error", "exception", "catch", "try"], category: "Robust error handling pattern" },
            { keywords: ["config", "env", "environment"], category: "Configuration and environment control pattern" },
        ];

        const lower = taskDescription.toLowerCase();
        let categoryStr = "";
        for (const { keywords, category } of patterns) {
            if (keywords.some(k => lower.includes(k))) {
                categoryStr = ` using ${category}`;
                break;
            }
        }

        const cleanedTask = taskDescription.replace(/\r?\n/g, " ").trim();
        const truncatedTask = cleanedTask.length > 120 ? cleanedTask.substring(0, 117) + "..." : cleanedTask;
        const capitalizedTask = truncatedTask.charAt(0).toUpperCase() + truncatedTask.slice(1);

        return `Successfully completed task: "${capitalizedTask}"${categoryStr}.`;
    }

    /**
     * Reads learned conventions from an agent's specialty memory.
     * Used by silent-router to inject context into AI calls.
     */
    public static readLearnedConventions(agentName: string): string {
        const cleanName = agentName.replace("@", "");
        const fwDir = getFrameworkDir();
        const filePath = path.join(fwDir, "memory", "specialties", `${cleanName}.md`);

        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, "utf8").trim();
                if (content) return content;
            }
        } catch {
            // File might not exist yet
        }
        return "";
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
}
