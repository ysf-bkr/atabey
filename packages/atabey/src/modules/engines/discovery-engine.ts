/**
 * [ENGINE] Architecture Discovery Protocol (ADP)
 *
 * Implements the ADP from ATABEY_FULL.md:
 * 1. Entry Point Hunt — find main entry points (index.ts, main.ts, server.ts)
 * 2. Business Logic Mapping — search for service/repository/controller patterns
 * 3. Contract Analysis — locate type definitions and API schemas
 * 4. Adaptive Scaffolding — propose architectural improvements before coding
 */

import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

export interface DiscoveryResult {
    entryPoints: string[];
    businessLogic: string[];
    contracts: string[];
    architecture: string;
    recommendations: string[];
}

export class DiscoveryEngine {
    /**
     * Runs the full Architecture Discovery Protocol on a project.
     */
    public static async discover(projectRoot: string): Promise<DiscoveryResult> {
        logger.info(`[ADP] Starting Architecture Discovery Protocol for ${projectRoot}`);

        const entryPoints = DiscoveryEngine.findEntryPoints(projectRoot);
        const businessLogic = DiscoveryEngine.mapBusinessLogic(projectRoot);
        const contracts = DiscoveryEngine.analyzeContracts(projectRoot);
        const architecture = DiscoveryEngine.detectArchitecture(projectRoot);
        const recommendations = DiscoveryEngine.generateRecommendations(entryPoints, businessLogic, contracts, architecture);

        // Log discovery results
        AtabeyStorage.saveLog({
            agent: "@explorer",
            action: "ARCHITECTURE_DISCOVERY",
            trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
            status: "SUCCESS",
            summary: `ADP complete: ${entryPoints.length} entry points, ${businessLogic.length} logic files, ${contracts.length} contracts`
        });

        return { entryPoints, businessLogic, contracts, architecture, recommendations };
    }

    /**
     * Step 1: Entry Point Hunt — find main entry points.
     */
    public static findEntryPoints(projectRoot: string): string[] {
        const entryPoints: string[] = [];
        const patterns = ["index.ts", "main.ts", "server.ts", "app.ts", "index.js", "main.js", "server.js"];

        const searchDir = (dir: string, depth: number) => {
            if (depth > 3) return; // Limit depth
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
                        searchDir(path.join(dir, entry.name), depth + 1);
                    } else if (patterns.includes(entry.name)) {
                        entryPoints.push(path.relative(projectRoot, path.join(dir, entry.name)));
                    }
                }
            } catch { /* skip unreadable */ }
        };

        searchDir(projectRoot, 0);
        return entryPoints;
    }

    /**
     * Step 2: Business Logic Mapping — find service/repository/controller patterns.
     */
    public static mapBusinessLogic(projectRoot: string): string[] {
        const logicFiles: string[] = [];
        const patterns = ["service", "repository", "controller", "handler", "use-case", "domain"];

        const searchDir = (dir: string) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
                        searchDir(fullPath);
                    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
                        const lower = entry.name.toLowerCase();
                        if (patterns.some(p => lower.includes(p))) {
                            logicFiles.push(path.relative(projectRoot, fullPath));
                        }
                    }
                }
            } catch { /* skip unreadable */ }
        };

        searchDir(projectRoot);
        return logicFiles;
    }

    /**
     * Step 3: Contract Analysis — find type definitions and API schemas.
     */
    public static analyzeContracts(projectRoot: string): string[] {
        const contractFiles: string[] = [];
        const patterns = ["types.ts", "schema.ts", "contract.ts", "interface.ts", "dto.ts", "api.ts"];

        const searchDir = (dir: string) => {
            try {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
                        searchDir(fullPath);
                    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts"))) {
                        const lower = entry.name.toLowerCase();
                        if (patterns.some(p => lower.includes(p))) {
                            contractFiles.push(path.relative(projectRoot, fullPath));
                        }
                    }
                }
            } catch { /* skip unreadable */ }
        };

        searchDir(projectRoot);
        return contractFiles;
    }

    /**
     * Detects the project architecture type.
     */
    public static detectArchitecture(projectRoot: string): string {
        const hasSrc = fs.existsSync(path.join(projectRoot, "src"));
        const hasApps = fs.existsSync(path.join(projectRoot, "apps"));
        const hasPackages = fs.existsSync(path.join(projectRoot, "packages"));
        const hasBackend = fs.existsSync(path.join(projectRoot, "backend")) || fs.existsSync(path.join(projectRoot, "server"));
        const hasFrontend = fs.existsSync(path.join(projectRoot, "frontend")) || fs.existsSync(path.join(projectRoot, "web"));
        const hasPackageJson = fs.existsSync(path.join(projectRoot, "package.json"));

        if (hasApps || hasPackages) return "monorepo";
        if (hasSrc && hasBackend && hasFrontend) return "fullstack-src";
        if (hasBackend && hasFrontend) return "fullstack";
        if (hasBackend) return "backend-only";
        if (hasFrontend) return "frontend-only";
        if (hasSrc) return "src-based";
        if (hasPackageJson) return "simple-node";
        return "unknown";
    }

    /**
     * Generates recommendations based on discovery results.
     */
    public static generateRecommendations(
        entryPoints: string[],
        businessLogic: string[],
        contracts: string[],
        architecture: string
    ): string[] {
        const recommendations: string[] = [];

        if (entryPoints.length === 0) {
            recommendations.push("No entry point found. Consider creating a standard entry point (index.ts, main.ts).");
        }
        if (businessLogic.length === 0) {
            recommendations.push("No business logic files found. Consider using service/repository pattern.");
        }
        if (contracts.length === 0) {
            recommendations.push("No contract/type files found. Define shared types before implementation.");
        }
        if (architecture === "unknown") {
            recommendations.push("Architecture type undetected. Run `atabey init` to scaffold project structure.");
        }

        recommendations.push(`Detected architecture: ${architecture}`);
        return recommendations;
    }
}
