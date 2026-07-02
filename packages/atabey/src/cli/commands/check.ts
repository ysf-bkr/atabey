import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { ALL_AGENTS } from "../../modules/agents/definitions.js";
import { ADAPTERS } from "../platforms/core.js";
import { FRAMEWORK, MCP, NATIVE_AGENT_PATHS } from "../../shared/constants.js";
import { logger } from "../../shared/logger.js";
import { detectActiveAgentLayouts, findAgentInstruction, getUnifiedAgentLayoutBases } from "../platforms/paths.js";
import { scanProjectCompliance } from "../utils/compliance.js";
import {
    detectProjectKind,
    getConfiguredPaths,
    getFrameworkDir,
    getMemoryPath,
    isAtabeyFrameworkMonorepo,
    isFrameworkDevelopmentRepo,
    readState,
} from "../utils/memory.js";
import { getPackageVersion } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";
import { validateAlRegistry } from "../utils/validate-registry.js";

import { verifyApiContractCommand } from "./contract.js";

export async function checkCommand() {
    UI.intent("Agent Atabey Health Check", `Checking system health and discipline rules (v${getPackageVersion()})...`);
    let issues = 0;

    const state = readState();
    if (!state) {
        UI.error("Memory state not found. Run 'init' first.");
        return;
    }

    const projectRoot = process.cwd();
    const frameworkDir = getFrameworkDir();
    const memoryPath = getMemoryPath();
    const pathsMap = getConfiguredPaths();

    UI.success(`Using framework dir: ${frameworkDir}`);

    // --- Contract Gate (Phase 2+ Discipline) ---
    if (["PHASE_2", "PHASE_3", "PHASE_4"].includes(state.phase)) {
        UI.intent("API Contract Validation", "Validating API Contracts (Phase 2+ Required)...");
        try {
            const contractOk = await verifyApiContractCommand({ silent: true });
            if (!contractOk) {
                UI.error("Contract verification FAILED! You cannot be in Phase 2+ with unverified contracts.");
                issues++;
            } else {
                UI.success("API Contracts verified and sealed.");
            }
        } catch {
            UI.error("Error during contract verification.");
            issues++;
        }
    }

    let knowledgeDir = "knowledge";
    if (frameworkDir === ".github") knowledgeDir = "instructions";

    const constitutionPath = fs.existsSync(path.join(process.cwd(), "ATABEY.md")) ? "ATABEY.md" : path.join(frameworkDir, "ATABEY.md");

    const rootPandaPath = path.join(process.cwd(), "panda.config.ts");
    const appPandaPath = path.join(pathsMap.frontend, "panda.config.ts");

    if (fs.existsSync(rootPandaPath)) {
        UI.error(`Panda CSS config must NOT be at the root directory! Move it to '${pathsMap.frontend}/panda.config.ts'.`);
        issues++;
    }

    const isFrameworkDevelopment = isFrameworkDevelopmentRepo();

    const checks = [
        { name: "Constitution (ATABEY.md)", path: constitutionPath },
        { name: "Memory (PROJECT_MEMORY.md)", path: path.relative(process.cwd(), memoryPath) },
        { name: "Command Map (cli-commands.json)", path: path.join(frameworkDir, "cli-commands.json") },
        { name: "Framework Config (config.json)", path: path.join(frameworkDir, "config.json") },
        { name: "Agent Status (STATUS.md)", path: path.join(frameworkDir, "STATUS.md") },
        { name: "MCP Config (mcp.json)", path: "mcp.json" },
        { name: "ESLint Config (eslint.config.js)", path: "eslint.config.js", optional: !isFrameworkDevelopment },
        { name: "ESLint Standards", path: path.join(frameworkDir, `${knowledgeDir}/eslint-standards.md`) },
        { name: "CRUD Governance Standards", path: path.join(frameworkDir, `${knowledgeDir}/crud-governance.md`) },
        { name: "Architecture Standards", path: path.join(frameworkDir, `${knowledgeDir}/architecture-standards.md`) },
        { name: "Frontend Standards", path: path.join(frameworkDir, `${knowledgeDir}/frontend-standards.md`) },
        { name: "Vite Standards", path: path.join(frameworkDir, `${knowledgeDir}/vite-standards.md`), optional: true },
        { name: "Next.js Standards", path: path.join(frameworkDir, `${knowledgeDir}/nextjs-standards.md`), optional: true },
        { name: "Tailwind Standards", path: path.join(frameworkDir, `${knowledgeDir}/tailwind-standards.md`), optional: true },
        { name: "Mobile Standards", path: path.join(frameworkDir, `${knowledgeDir}/mobile-standards.md`) },
        { name: "Security Standards", path: path.join(frameworkDir, `${knowledgeDir}/security-standards.md`) },
        { name: "Quality & Discipline Standards", path: path.join(frameworkDir, `${knowledgeDir}/quality-standards.md`) },
        { name: "Logging & Secrets Standards", path: path.join(frameworkDir, `${knowledgeDir}/logging-and-secrets.md`) },
        { name: "Testing Standards", path: path.join(frameworkDir, `${knowledgeDir}/testing-standards.md`) },
        { name: "i18n Standards", path: path.join(frameworkDir, `${knowledgeDir}/i18n-standards.md`) },
        { name: ".env.example", path: ".env.example" },
        ...(isFrameworkDevelopment ? [{ name: "MCP Server", path: "packages/atabey-mcp/package.json" }] : []),
        {
            name: "Panda CSS Config",
            path: appPandaPath,
            optional: true,
            skip: isAtabeyFrameworkMonorepo() || !pathsMap.frontend.startsWith("apps/"),
        },
    ];

    for (const check of checks) {
        if ("skip" in check && check.skip) continue;
        const fullPath = path.isAbsolute(check.path) ? check.path : path.join(process.cwd(), check.path);
        if (fs.existsSync(fullPath)) {
            UI.success(`${check.name} found.`);
        } else {
            if (check.optional) {
                UI.warning(`${check.name} MISSING! (${check.path}) [Optional]`);
            } else {
                UI.error(`${check.name} MISSING! (${check.path})`);
                issues++;
            }
        }
    }

    if (isAtabeyFrameworkMonorepo()) {
        UI.success(`Framework monorepo detected (${detectProjectKind()}) — apps/backend · apps/web checks skipped (consumer scaffold only).`);
    }

    // MCP transport validation (IDE clients require stdio)
    const rootMcpPath = path.join(projectRoot, MCP.ROOT_CONFIG_FILE);
    if (fs.existsSync(rootMcpPath)) {
        try {
            const mcpCfg = JSON.parse(fs.readFileSync(rootMcpPath, "utf8")) as {
                mcpServers?: Record<string, { env?: Record<string, string> }>;
            };
            const atabeyEntry = mcpCfg.mcpServers?.[MCP.SERVER_NAME];
            const transport = atabeyEntry?.env?.[MCP.TRANSPORT_ENV];
            if (transport && transport !== MCP.TRANSPORT_STDIO) {
                UI.warning(
                    `MCP transport is '${transport}' in mcp.json. IDE clients (Cursor/Claude/Gemini) require '${MCP.TRANSPORT_STDIO}'. ` +
                    "Run 'atabey mcp install' or re-run init to repair.",
                );
            } else if (!transport) {
                UI.warning(
                    `MCP_TRANSPORT missing in mcp.json. IDE connection may fail. Run 'atabey mcp install' to repair.`,
                );
            } else {
                UI.success(`MCP transport configured for IDE: ${MCP.TRANSPORT_STDIO}`);
            }
        } catch (err) {
            logger.debug(`Failed to parse ${rootMcpPath}: ${(err as Error).message}`);
        }
    }

    // Unified mode layout check (config vs on-disk scaffold)
    const configPath = path.join(frameworkDir, "config.json");
    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
                unified?: boolean;
                adapters?: string[];
            };

            if (config.unified) {
                UI.intent("Unified Layout Check", "Validating multi-platform adapter scaffold...");

                const unifiedHub = path.join(projectRoot, FRAMEWORK.UNIFIED_HUB_DIR);
                if (!fs.existsSync(unifiedHub)) {
                    const setupHint = isAtabeyFrameworkMonorepo()
                        ? "Run 'npm run atabey:setup' (adapter dirs are gitignored in the framework repo)."
                        : "Run 'atabey init <adapter> --unified --yes' to scaffold all platforms.";
                    if (isAtabeyFrameworkMonorepo()) {
                        UI.warning(`Unified hub '${FRAMEWORK.UNIFIED_HUB_DIR}/' missing (expected locally). ${setupHint}`);
                    } else {
                        UI.error(`Unified mode is enabled but '${FRAMEWORK.UNIFIED_HUB_DIR}/' is missing. ${setupHint}`);
                        issues++;
                    }
                } else {
                    UI.success(`Unified hub found: ${FRAMEWORK.UNIFIED_HUB_DIR}/`);
                }

                const configuredAdapters: string[] = config.adapters?.length
                    ? config.adapters
                    : Object.keys(ADAPTERS);

                for (const adapterId of configuredAdapters) {
                    if (!(adapterId in ADAPTERS)) continue;
                    const nativeRel = NATIVE_AGENT_PATHS[adapterId as keyof typeof NATIVE_AGENT_PATHS];
                    if (!nativeRel) continue;
                    const nativePath = path.join(projectRoot, nativeRel);
                    if (!fs.existsSync(nativePath)) {
                        UI.warning(
                            `Native adapter layout missing for '${adapterId}' (${nativeRel}). ` +
                            "Re-run unified init to regenerate mirrors.",
                        );
                    }
                }

                const expectedUnifiedBases = getUnifiedAgentLayoutBases();
                const missingUnified = expectedUnifiedBases.filter(
                    (rel) => !fs.existsSync(path.join(projectRoot, rel)),
                );
                if (missingUnified.length > 0) {
                    UI.warning(
                        `Unified hub layouts incomplete: ${missingUnified.join(", ")}. ` +
                        "Re-run 'atabey init <adapter> --unified --yes'.",
                    );
                }

                for (const adapterId of configuredAdapters) {
                    if (!(adapterId in ADAPTERS)) continue;
                    const shimFile = ADAPTERS[adapterId as keyof typeof ADAPTERS].shimFile;
                    if (!shimFile) continue;
                    const shimPath = path.join(projectRoot, shimFile);
                    if (!fs.existsSync(shimPath)) {
                        UI.warning(`Platform shim missing for '${adapterId}': ${shimFile}`);
                    }
                }
            }
        } catch (err) {
            logger.debug(`Failed unified layout check for ${configPath}: ${(err as Error).message}`);
        }

        // Compliance & FinOps config validation
        try {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
                finops?: { tracking?: boolean; enforcement?: boolean; monthlyBudgetUsd?: number };
                compliance?: { retentionEnabled?: boolean; consentLogging?: boolean; piiMasking?: boolean };
            };

            UI.intent("Compliance & FinOps", "Validating token economy and privacy settings...");

            const llmGovPath = path.join(frameworkDir, "knowledge", "llm-governance.md");
            if (fs.existsSync(llmGovPath)) {
                UI.success("LLM governance standard found (EU AI Act alignment).");
            } else {
                UI.warning("Missing knowledge/llm-governance.md — re-run init to scaffold EU AI Act guidelines.");
            }

            if (config.finops?.tracking !== false) {
                UI.success("FinOps token tracking enabled.");
            } else {
                UI.warning("FinOps tracking disabled in config.json.");
            }

            if (config.finops?.enforcement && (config.finops.monthlyBudgetUsd || 0) > 0) {
                UI.success(`FinOps budget enforcement active ($${config.finops.monthlyBudgetUsd}/mo).`);
            } else if (config.finops?.enforcement) {
                UI.warning("FinOps enforcement enabled but monthlyBudgetUsd is 0 — tracking only.");
            }

            if (config.compliance?.piiMasking !== false) {
                UI.success("PII masking enabled (KVKK/GDPR).");
            }
            if (config.compliance?.retentionEnabled !== false) {
                UI.success("Data retention policies configured.");
            }
            if (config.compliance?.consentLogging !== false) {
                UI.success("Consent logging enabled.");
            }
        } catch (err) {
            logger.debug(`Failed compliance/finops check: ${(err as Error).message}`);
        }
    }

    // AL Registry Check
    UI.intent("Security Check", "Running AL Registry Compliance...");
    try {
        const { success, output } = validateAlRegistry(projectRoot);
        process.stdout.write(output);
        if (!success) {
            UI.error("AL Registry validation FAILED.");
            issues++;
        } else {
            UI.success("AL Registry validation PASSED.");
        }
    } catch (error: unknown) {
        const err = error as Error;
        UI.error(`AL Registry validation FAILED: ${err.message}`);
        issues++;
    }

    // Agent Documentation Check (Live Integrity)
    UI.intent("Agent Integrity Check", "Checking Agent Integrity (Instructions)...");

    const activeLayouts = detectActiveAgentLayouts(projectRoot);

    if (activeLayouts.length > 0) {
        UI.success(`Active agent layout(s): ${activeLayouts.join(", ")}`);
        
        const configPath = path.join(frameworkDir, "config.json");
        let configuredAgents: string[] = [];
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
                configuredAgents = config.agents || [];
            } catch (err) {
                logger.debug(`Failed to parse config.json at ${configPath}: ${(err as Error).message}`);
            }
        }

        const targetAgents = configuredAgents.length > 0
            ? ALL_AGENTS.filter(a => configuredAgents.includes(a.name))
            : ALL_AGENTS;

        targetAgents.forEach((agent) => {
            const found = findAgentInstruction(projectRoot, agent.name);
            if (found) {
                UI.success(`Instructions for @${agent.name} found at ${found}`);
            } else {
                UI.error(`Instructions for @${agent.name} MISSING! Run 'atabey init' to scaffold.`);
                issues++;
            }
        });
    } else {
        UI.warning("No active agent instruction directory detected. Run 'atabey init [adapter]' first.");
        issues++;
    }

    // Code Quality - Using the new Compliance Scanner
    UI.intent("Code Quality Check", "Checking Discipline (Code Quality)...");
    const complianceIssues = scanProjectCompliance();
    if (complianceIssues.length > 0) {
        complianceIssues.forEach(issue => {
            UI.error(`${issue.rule} in ${issue.file}:${issue.line}`);
        });
        issues += complianceIssues.length;
    } else {
        UI.success("No compliance issues detected.");
    }

    const rootTestFiles = checkRootTestFiles();
    if (rootTestFiles.length > 0) {
        UI.warning(`Test files found in the root directory: ${rootTestFiles.join(", ")}. It is recommended to place all test files under the 'tests/' folder or application-specific directories.`);
    }

    try {
        if (isAtabeyFrameworkMonorepo()) {
            UI.intent("Type Check", "Compiling framework packages (atabey, atabey-mcp, shared)...");
            execSync("npm run build -w packages/shared -w packages/atabey -w packages/atabey-mcp", { stdio: "pipe" });
            UI.success("Framework package build PASSED.");
        } else {
            UI.intent("Type Check", "Compiling with 'npx tsc --noEmit'...");
            execSync("npx tsc --noEmit", { stdio: "pipe" });
            UI.success("TypeScript type check PASSED.");
        }
    } catch (err) {
        UI.warning("TypeScript type check FAILED or build error. This is a non-blocking warning for lightweight checks.");
        logger.debug("Type check / build failed in atabey check", err);
    }

    if (issues === 0) {
        UI.success("\nAll systems green! Agent Atabey is ready.");
    } else {
        UI.error(`Found ${issues} issues. Please fix them.`);
        process.exit(1);
    }
}

function checkRootTestFiles(): string[] {
    const rootDir = process.cwd();
    if (!fs.existsSync(rootDir)) return [];
    const files = fs.readdirSync(rootDir);
    const testFiles: string[] = [];
    for (const file of files) {
        const fullPath = path.join(rootDir, file);
        try {
            if (fs.statSync(fullPath).isFile()) {
                if (file.includes(".test.") || file.includes(".spec.")) {
                    testFiles.push(file);
                }
            }
        } catch (err) {
            logger.debug(`Failed to stat file ${fullPath} in checkRootTestFiles`, err);
        }
    }
    return testFiles;
}
