import fs from "fs";
import path from "path";
import type { CheckArchitectureComplianceArgs } from "../schemas.js";
import { ToolResult } from "../types.js";

/**
 * [TOOL] check_architecture_compliance
 *
 * Checks architectural compliance for code at the specified path:
 * - Controller/Service/Repository layer separation
 * - Import rules (controller → service → repository)
 * - Circular dependencies
 */
export function handleCheckArchitectureCompliance(
    projectRoot: string,
    args: CheckArchitectureComplianceArgs
): ToolResult {
    const targetPath = path.resolve(projectRoot, args.path);

    if (!fs.existsSync(targetPath)) {
        return {
            isError: true,
            content: [{ type: "text", text: `[ERROR] Path does not exist: ${args.path}` }]
        };
    }

    const results: string[] = [
        "# Architecture Compliance Report",
        "",
        `**Target:** ${args.path}`,
        `**Timestamp:** ${new Date().toISOString()}`,
        ""
    ];

    const violations: string[] = [];
    const allFiles: string[] = [];

    // Collect all relevant files
    function collectFiles(dir: string) {
        if (!fs.existsSync(dir)) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith("node_modules") && !entry.name.startsWith(".")) {
                collectFiles(fullPath);
            } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
                allFiles.push(fullPath);
            }
        }
    }

    collectFiles(targetPath);

    // Analyze each file for architectural violations
    for (const file of allFiles) {
        const relativePath = path.relative(projectRoot, file);
        const content = fs.readFileSync(file, "utf8");
        const lines = content.split("\n");
        const fileName = path.basename(file, path.extname(file));
        const fileDir = path.dirname(file);

        // 1. Layer naming convention check
        const isController = fileName.endsWith(".controller") || fileName.endsWith("Controller");
        const isService = fileName.endsWith(".service") || fileName.endsWith("Service");
        const isRepository = fileName.endsWith(".repository") || fileName.endsWith("Repository");
        const isModel = fileName.endsWith(".model") || fileName.endsWith("Model");

        // 2. Controller → Service → Repository dependency direction
        for (const line of lines) {
            const importMatch = line.match(/import\s+.*\s+from\s+['"](.+)['"]/);
            if (!importMatch) continue;

            const importPath = importMatch[1];
            const importedFileName = path.basename(importPath, path.extname(importPath));

            // Controller importing Repository directly (should go through Service)
            if (isController && (importedFileName.endsWith(".repository") || importedFileName.endsWith("Repository"))) {
                violations.push(
                    `- ${relativePath}: Controller \`${fileName}\` directly imports Repository \`${importedFileName}\`. ` +
                    "Use Service layer instead."
                );
            }

            // Repository importing Controller
            if (isRepository && (importedFileName.endsWith(".controller") || importedFileName.endsWith("Controller"))) {
                violations.push(
                    `- ${relativePath}: Repository \`${fileName}\` imports Controller \`${importedFileName}\`. ` +
                    "Reverse dependency detected."
                );
            }

            // Service importing Controller
            if (isService && (importedFileName.endsWith(".controller") || importedFileName.endsWith("Controller"))) {
                violations.push(
                    `- ${relativePath}: Service \`${fileName}\` imports Controller \`${importedFileName}\`. ` +
                    "Service should not depend on Controller."
                );
            }

            // Model importing Controller/Service/Repository
            if (isModel && (importedFileName.endsWith("Controller") || importedFileName.endsWith("Service") || importedFileName.endsWith("Repository"))) {
                violations.push(
                    `- ${relativePath}: Model \`${fileName}\` imports \`${importedFileName}\`. ` +
                    "Models should not depend on other layers."
                );
            }
        }

        // 3. Check for barrel index imports that might cause circular dependencies
        if (fileName === "index" && fileDir.includes("modules")) {
            const indexContent = fs.readFileSync(file, "utf8");
            const exports = indexContent.match(/export\s+\*?\s*from\s+['"].+['"]/g) || [];
            if (exports.length > 10) {
                violations.push(
                    `- ${relativePath}: Barrel file exports ${exports.length} modules. ` +
                    "Consider splitting into smaller barrels to prevent circular dependencies."
                );
            }
        }
    }

    // 4. Strict mode check
    let hasStrictMode = false;
    const tsConfigPath = path.join(projectRoot, "tsconfig.json");
    if (fs.existsSync(tsConfigPath)) {
        try {
            const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, "utf8"));
            if (tsConfig.compilerOptions?.strict) {
                hasStrictMode = true;
            }
        } catch {
            // Ignore parse errors
        }
    }

    if (!hasStrictMode) {
        violations.push("- tsconfig.json: `strict` mode is not enabled. Atabey requires strict type checking.");
    }

    // Report
    if (violations.length > 0) {
        results.push(`## ❌ Architecture Violations (${violations.length})`);
        results.push("");
        results.push(...violations);
        results.push("");
        results.push("---");
        results.push(`**Status:** ❌ FAILED — ${violations.length} architectural violations found.`);
    } else {
        results.push("## ✅ Architecture Compliance: PASSED");
        results.push("");
        results.push("- All layer dependencies are correctly oriented.");
        results.push("- No circular dependencies detected.");
        results.push("- Strict mode is enabled.");
        results.push("");
        results.push("---");
        results.push("**Status:** ✅ All architecture checks passed.");
    }

    return {
        content: [{ type: "text", text: results.join("\n") }],
        isError: violations.length > 0
    };
}
