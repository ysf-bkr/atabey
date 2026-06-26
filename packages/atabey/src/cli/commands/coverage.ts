import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { getPackageRoot } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

interface CoverageSummary {
    lines: number;
    functions: number;
    branches: number;
    statements: number;
}

interface FileCoverage {
    file: string;
    stmts: number;
    branch: number;
    funcs: number;
    lines: number;
    uncovered: string[];
}

function parseCoverageSummary(): CoverageSummary | null {
    const coverageDir = path.join(getPackageRoot(), "coverage");
    const summaryPath = path.join(coverageDir, "coverage-summary.json");
    if (!fs.existsSync(summaryPath)) return null;
    try {
        const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        const total = raw.total;
        return { lines: total.lines.pct, functions: total.functions.pct, branches: total.branches.pct, statements: total.statements.pct };
    } catch (err) {
        logger.warn("Failed to parse coverage summary", err);
        return null;
    }
}

function getFileCoverage(): FileCoverage[] {
    const coverageDir = path.join(getPackageRoot(), "coverage");
    const summaryPath = path.join(coverageDir, "coverage-summary.json");
    if (!fs.existsSync(summaryPath)) return [];
    try {
        const raw = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
        const files: FileCoverage[] = [];
        for (const [filePath, data] of Object.entries(raw)) {
            if (filePath === "total") continue;
            const d = data as Record<string, { pct: number }>;
            files.push({ file: filePath.replace(process.cwd() + "/", ""), stmts: d.statements?.pct ?? 0, branch: d.branches?.pct ?? 0, funcs: d.functions?.pct ?? 0, lines: d.lines?.pct ?? 0, uncovered: [] });
        }
        return files.sort((a, b) => a.lines - b.lines);
    } catch (err) {
        logger.warn("Failed to parse file coverage", err);
        return [];
    }
}

function getThresholdConfig(): { lines: number; functions: number; branches: number; statements: number } {
    const vitestConfigPath = path.join(getPackageRoot(), "vitest.config.ts");
    if (!fs.existsSync(vitestConfigPath)) return { lines: 80, functions: 80, branches: 80, statements: 80 };
    try {
        const content = fs.readFileSync(vitestConfigPath, "utf8");
        const linesMatch = content.match(/lines:\s*(\d+)/);
        const funcsMatch = content.match(/functions:\s*(\d+)/);
        const branchesMatch = content.match(/branches:\s*(\d+)/);
        const stmtsMatch = content.match(/statements:\s*(\d+)/);
        return {
            lines: linesMatch ? parseInt(linesMatch[1]) : 80,
            functions: funcsMatch ? parseInt(funcsMatch[1]) : 80,
            branches: branchesMatch ? parseInt(branchesMatch[1]) : 80,
            statements: stmtsMatch ? parseInt(stmtsMatch[1]) : 80,
        };
    } catch (err) {
        logger.warn("Failed to parse threshold config", err);
        return { lines: 80, functions: 80, branches: 80, statements: 80 };
    }
}

function getLowCoverageFiles(files: FileCoverage[], threshold: number): FileCoverage[] {
    return files.filter((f) => f.lines > 0 && f.lines < threshold && !f.file.includes("node_modules") && !f.file.includes("dist/"));
}

function suggestImprovements(lowCoverageFiles: FileCoverage[]): string[] {
    const suggestions: string[] = [];
    for (const f of lowCoverageFiles.slice(0, 10)) {
        const testPath = f.file.replace("src/", "tests/").replace(".ts", ".test.ts");
        suggestions.push(`${f.file} (${f.lines}%) -> Create ${testPath}`);
    }
    return suggestions;
}

export async function coverageCommand(): Promise<void> {
    const statusIcon = (current: number, threshold: number): string => current >= threshold ? "[OK]" : "[LOW]";

    const coverageDir = path.join(getPackageRoot(), "coverage");
    if (!fs.existsSync(path.join(coverageDir, "coverage-summary.json"))) {
        UI.info("Running tests with coverage...");
        try {
            execSync("npm run test:coverage", { stdio: "inherit", cwd: getPackageRoot() });
        } catch (err) {
            logger.warn("Coverage run failed (some tests may have failed), continuing with existing coverage data", err);
        }
    }

    const summary = parseCoverageSummary();
    if (!summary) {
        UI.info("No coverage data found. Run 'npm run test:coverage' first.");
        return;
    }

    const thresholds = getThresholdConfig();

    UI.info("Test Coverage Analysis");
    const header = `  ${"Metric".padEnd(13)} | ${"Current".padEnd(7)} | ${"Threshold".padEnd(9)} | Status`;
    const separator = "  " + "-".repeat(header.length - 4);
    process.stdout.write(header + "\n");
    process.stdout.write(separator + "\n");
    for (const [name, val] of Object.entries({ Lines: summary.lines, Functions: summary.functions, Branches: summary.branches, Statements: summary.statements })) {
        const threshold = thresholds[name.toLowerCase() as keyof typeof thresholds];
        process.stdout.write(`  ${name.padEnd(13)} | ${String(val).padStart(7)}% | ${String(threshold).padStart(9)}% | ${statusIcon(val, threshold)}\n`);
    }

    const files = getFileCoverage();
    const lowCoverageFiles = getLowCoverageFiles(files, thresholds.lines);

    if (lowCoverageFiles.length > 0) {
        UI.info(`Low Coverage Files (below ${thresholds.lines}%):`);
        for (const f of lowCoverageFiles.slice(0, 15)) {
            process.stdout.write(`    ${f.file.padEnd(55)} ${f.lines}%\n`);
        }
        const suggestions = suggestImprovements(lowCoverageFiles);
        if (suggestions.length > 0) {
            UI.info("Improvement Suggestions:");
            for (const s of suggestions) process.stdout.write(`    -> ${s}\n`);
        }
    } else {
        UI.success("All files meet the coverage threshold.");
    }
}
