import path from "path";
import { scanProjectCompliance } from "../utils/compliance.js";
import { UI } from "../utils/ui.js";

/**
 * CLI Command: atabey check:compliance [targetPath]
 * Runs the centralized enterprise compliance scanner on the codebase.
 */
export async function complianceCheckCommand(targetPath: string = "src") {
    UI.warning(`[COMPLIANCE] Scanning for Constitution Violations in: ${targetPath}...`);

    try {
        const issues = scanProjectCompliance(targetPath);

        if (issues.length === 0) {
            UI.success("[OK] All systems compliant with ATABEY.md.");
        } else {
            issues.forEach(issue => {
                const relativePath = path.relative(process.cwd(), issue.file);
                if (issue.rule.includes("Technical Debt")) {
                    UI.info(`[DEBT]  ${relativePath}:${issue.line} - ${issue.rule}`);
                } else {
                    UI.error(`[BREACH] ${relativePath}:${issue.line} - ${issue.rule}`);
                }
            });

            const breachCount = issues.filter(i => !i.rule.includes("Technical Debt")).length;
            const debtCount = issues.length - breachCount;

            process.stdout.write("\n--- Compliance Summary ---\n");
            if (breachCount > 0) UI.error(`Critical Breaches: ${breachCount}`);
            if (debtCount > 0) UI.info(`Technical Debt:    ${debtCount}`);
            process.stdout.write("--------------------------\n");

            if (breachCount > 0) {
                process.exit(1); // Exit with error if there are critical breaches
            }
        }
    } catch (err) {
        UI.error(`Compliance check failed: ${(err as Error).message}`);
        process.exit(70);
    }
}
