import { execSync } from "child_process";
import { scanProjectCompliance } from "../../cli/utils/compliance.js";
import { logger } from "../../shared/logger.js";

export interface QualityResult {
    passed: boolean;
    reason: string;
    findings?: unknown;
}

/**
 * [ENGINE] Quality Gate
 * Atabey Order v2 — Deterministic Quality Inspection Center.
 * Inspects agent outputs and codebase against constitutional rules.
 *
 * v0.0.14: Selective file-level lint (not full-project), removed test execution
 * from quality gate (tests are a CI concern), added `any` type detection.
 */
export class QualityGate {
    /**
     * Puts an agent's work through quality testing.
     * 1. Compliance (Constitutional compliance via AST scan)
     * 2. Lint (Targeted file lint if filePath is provided)
     * 3. Content Validation (Output quality check)
     *
     * Note: Test execution is intentionally excluded from the quality gate.
     * Tests are run separately via 'npm test' in CI. The gate focuses on
     * the immediate output quality, not full regression coverage.
     */
    public static async check(
        agent: string,
        output: string,
        task: string,
        filePath?: string,
    ): Promise<QualityResult> {
        logger.info(`[QUALITY_GATE] Starting audit for ${agent}...`);

        // Skip deep ecosystem commands during framework unit testing to prevent infinite recursion
        const isTestEnv = process.env.VITEST === "true" || !!process.env.ATABEY_TEST_DIR;

        if (!isTestEnv) {
            // 1. Compliance Check (AST Analysis — scans src/ for policy violations)
            const complianceIssues = scanProjectCompliance("src");
            if (complianceIssues.length > 0) {
                const summary = complianceIssues.map(i => `${i.file}:${i.line} (${i.rule})`).join(", ");
                return {
                    passed: false,
                    reason: `Compliance issues found: ${summary}`,
                    findings: complianceIssues
                };
            }

            // 2. Lint Check
            if (filePath) {
                try {
                    logger.debug("[QUALITY_GATE] Running ESLint on file...");
                    execSync(
                        `npx eslint --no-eslintrc --rule '{"@typescript-eslint/no-explicit-any": "error"}' ${filePath}`,
                        { stdio: "pipe" }
                    );
                } catch (err: unknown) {
                    const error = err as Error & { stderr?: Buffer };
                    return {
                        passed: false,
                        reason: "Lint check failed. Zero errors required.",
                        findings: error.stderr?.toString() || error.message
                    };
                }
            } else {
                logger.warn("[QUALITY_GATE] No filePath provided — skipping lint check.");
            }
        } else {
            logger.debug("[QUALITY_GATE] Framework unit test environment detected. Skipping ecosystem calls.");
        }

        // 3. Content Validation (Basic output quality check)
        const contentCheck = this.validateOutputContent(output, task);
        if (!contentCheck.passed) {
            return contentCheck;
        }

        logger.info(`[QUALITY_GATE] Audit PASSED for ${agent}`);
        return { passed: true, reason: "All quality gates passed." };
    }

    /**
     * Validates the quality of agent output content.
     * Checks for: empty output, error indicators, `any` type policy violations.
     */
    private static validateOutputContent(output: string, _task: string): QualityResult {
        if (!output || output.trim().length < 10) {
            return { passed: false, reason: "Output is too short or empty." };
        }

        // Check for hard error indicators (word-boundary match to avoid false positives
        // on valid identifiers such as 'ErrorBoundary', 'handleError', 'TIMEOUT_MS',
        // 'FAILED_VALIDATION', etc.).
        const errorIndicators = ["ERROR", "FAILED", "CRASHED", "TIMEOUT"];
        for (const indicator of errorIndicators) {
            if (new RegExp(`\\b${indicator}\\b`).test(output.toUpperCase())) {
                return { passed: false, reason: `Output contains error indicator: ${indicator}` };
            }
        }

        // Zero Type Hole policy: detect TypeScript `any` type usage in output
        if (/:\s*any\b/.test(output)) {
            return {
                passed: false,
                reason: "Output contains `any` type — Zero Type Hole policy violation. Use explicit types.",
            };
        }

        return { passed: true, reason: "Content validation passed." };
    }
}
