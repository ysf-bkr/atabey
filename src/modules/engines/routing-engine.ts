import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../../cli/utils/memory.js";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { asAgentID, asTraceID } from "../../shared/types.js";
import { ALL_AGENTS } from "../agents/definitions.js";

export interface RoutingCandidate {
    agent: string;
    specialties: Record<string, number>;
    displayName: string;
    role: string;
    capability: number;
    tier: string;
}

export interface RoutingResult {
    agent: string;
    score: number;
    confidence: "high" | "medium" | "low";
    reasoning: string;
    subTasks: string[];
}

export class RoutingEngine {
    /**
     * Advanced Routing Engine — analyzes task descriptions,
     * selects the most suitable agent, and determines subtasks.
     *
     * Uses real TF-IDF scoring: term frequency in the task weighted by
     * inverse document frequency across the full agent candidate corpus.
     */
    public static resolveAgent(taskDescription: string): string {
        return this.resolveWithDetails(taskDescription).agent;
    }

    /**
     * Returns detailed routing result — score, confidence, reasoning, subTasks
     */
    public static resolveWithDetails(taskDescription: string): RoutingResult {
        const textLower = taskDescription.toLowerCase();
        const tokens = this.tokenize(textLower);
        const candidates = this.getCandidates();

        let bestAgent = "@backend";
        let bestScore = 0;
        let bestReasoning = "";
        let bestSubTasks: string[] = [];

        for (const candidate of candidates) {
            let score = 0;
            const matches: string[] = [];

            // 1. Specialty matching (weighted TF-IDF)
            for (const [specialty, weight] of Object.entries(candidate.specialties)) {
                const specTokens = this.tokenize(specialty.toLowerCase());
                for (const token of tokens) {
                    if (specTokens.some(st => token.includes(st) || st.includes(token))) {
                        score += weight * this.calculateTfIdf(token, tokens, candidates);
                        matches.push(specialty);
                    }
                }
            }

            // 2. Role matching
            const roleTokens = this.tokenize(candidate.role.toLowerCase());
            for (const token of tokens) {
                if (roleTokens.some(rt => token.includes(rt) || rt.includes(token))) {
                    score += 3; // Role match bonus
                    matches.push(`role:${candidate.role}`);
                }
            }

            // 3. DisplayName matching
            const nameTokens = this.tokenize(candidate.displayName.toLowerCase());
            for (const token of tokens) {
                if (nameTokens.some(nt => token.includes(nt) || nt.includes(token))) {
                    score += 2;
                    matches.push(`name:${candidate.displayName}`);
                }
            }

            // Capability bonus (more capable agents get priority)
            score += (candidate.capability - 5) * 0.5;

            if (score > bestScore) {
                bestScore = score;
                bestAgent = candidate.agent;
                bestReasoning = matches.length > 0
                    ? `Matching fields: ${[...new Set(matches)].join(", ")}`
                    : "Selected based on general capability";
                bestSubTasks = this.generateSubTasks(candidate.agent, taskDescription);
            }
        }

        // Static fallback (if nothing matches)
        if (bestScore === 0) {
            const fallback = this.fallbackRouting(tokens);
            bestAgent = fallback.agent;
            bestReasoning = fallback.reasoning;
            bestSubTasks = fallback.subTasks;
        }

        const confidence: "high" | "medium" | "low" =
            bestScore > 15 ? "high"
                : bestScore > 7 ? "medium"
                    : "low";

        return {
            agent: bestAgent,
            score: Math.round(bestScore * 10) / 10,
            confidence,
            reasoning: bestReasoning,
            subTasks: bestSubTasks,
        };
    }

    /**
     * Automatically splits the task into subtasks
     */
    public static planTask(taskDescription: string): string[] {
        const result = this.resolveWithDetails(taskDescription);

        const plan: string[] = [
            `>> Task: ${taskDescription}`,
            `>> Assigned to: ${result.agent}`,
            `>> Confidence: ${result.confidence.toUpperCase()} (Score: ${result.score})`,
            `>> Reason: ${result.reasoning}`,
            "",
            ">> Subtasks:",
            ...result.subTasks.map((t, i) => `  ${i + 1}. ${t}`),
            "",
            ">> Quality Check:",
            `  - When ${result.agent} completes, @quality will review`,
            `  - If @quality rejects, the task returns to ${result.agent}`,
        ];

        return plan;
    }

    // ─── Private Helpers ────────────────────────────────────────────────

    private static tokenize(text: string): string[] {
        return text
            .replace(/[^a-z0-9çşıöğü ]/g, " ")
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    /**
     * Real TF-IDF calculation: term frequency × inverse document frequency.
     * IDF = log(N / (df + 1) + 1) where N = total candidates, df = candidates containing the term.
     */
    private static calculateTfIdf(term: string, tokens: string[], allCandidates: RoutingCandidate[]): number {
        // TF: normalized term frequency in the task
        const tf = tokens.filter(t => t === term).length / Math.max(tokens.length, 1);
        // IDF: log(N / df + 1) where N = total candidates, df = candidates containing the term
        const N = allCandidates.length;
        const df = allCandidates.filter(c =>
            Object.keys(c.specialties).some(s => s.toLowerCase().includes(term))
        ).length;
        const idf = Math.log(N / (df + 1) + 1);
        return (1 + tf) * idf;
    }

    private static fallbackRouting(tokens: string[]): { agent: string; reasoning: string; subTasks: string[] } {
        const text = tokens.join(" ");

        if (tokens.some(t => ["frontend","ui","page","css","html","react","component","button","form","modal","table","interface"].includes(t))) {
            return {
                agent: "@frontend",
                reasoning: "Frontend/UI keywords detected",
                subTasks: this.generateSubTasks("@frontend", text),
            };
        }
        if (tokens.some(t => ["security","auth","token","encrypt","login"].includes(t))) {
            return {
                agent: "@security",
                reasoning: "Security keywords detected",
                subTasks: this.generateSubTasks("@security", text),
            };
        }
        if (tokens.some(t => ["database","migration","sql","schema","table","index","query"].includes(t))) {
            return {
                agent: "@database",
                reasoning: "Database keywords detected",
                subTasks: this.generateSubTasks("@database", text),
            };
        }
        if (tokens.some(t => ["docker","ci","cd","deploy","devops","infra","server","nginx"].includes(t))) {
            return {
                agent: "@devops",
                reasoning: "DevOps/Infra keywords detected",
                subTasks: this.generateSubTasks("@devops", text),
            };
        }
        if (tokens.some(t => ["mobile","react native","expo","ios","android"].includes(t))) {
            return {
                agent: "@mobile",
                reasoning: "Mobile keywords detected",
                subTasks: this.generateSubTasks("@mobile", text),
            };
        }
        if (tokens.some(t => ["architect","design","architecture","contract","structure"].includes(t))) {
            return {
                agent: "@architect",
                reasoning: "Architecture/design keywords detected",
                subTasks: this.generateSubTasks("@architect", text),
            };
        }
        if (tokens.some(t => ["analysis","analyst","requirement","contract","validate"].includes(t))) {
            return {
                agent: "@analyst",
                reasoning: "Analysis/requirement keywords detected",
                subTasks: this.generateSubTasks("@analyst", text),
            };
        }

        return {
            agent: "@backend",
            reasoning: "Default routing to backend (most general capability)",
            subTasks: this.generateSubTasks("@backend", text),
        };
    }

    private static generateSubTasks(agent: string, taskDescription: string): string[] {
        const base: string[] = [
            `[*] ${agent}: Analyze and plan the task`,
            `[>] ${taskDescription}`,
            "[*] Write and run tests",
            "[*] Notify @quality for QA review",
        ];

        const agentSpecific: Record<string, string[]> = {
            "@manager": [
                "[*] Analyze task and break into subtasks",
                "[*] Identify suitable agents and distribute tasks",
                "[*] Monitor progress and manage quality gate",
            ],
            "@backend": [
                "[*] Create Controller-Service-Repository layers",
                "[*] Update API contracts",
                "[*] Integrate database operations",
            ],
            "@frontend": [
                "[*] Create UI components in atomic structure",
                "[*] Apply responsive design",
                "[*] Integrate with API",
            ],
            "@quality": [
                "[*] Run compliance check (check_compliance)",
                "[*] Run lint check",
                "[*] Verify test coverage",
                "[*] Report approval/rejection to @manager",
            ],
            "@database": [
                "[*] Prepare migration file",
                "[*] Optimize queries",
                "[*] Define index strategy",
            ],
            "@security": [
                "[*] Run security vulnerability scan",
                "[*] Verify auth/encryption controls",
                "[*] Check secret management",
            ],
            "@devops": [
                "[*] Prepare Docker configuration",
                "[*] Update CI/CD pipeline",
                "[*] Check environment variables",
            ],
            "@mobile": [
                "[*] Create React Native components",
                "[*] Apply offline-first architecture",
                "[*] Implement SafeArea and responsive controls",
            ],
            "@explorer": [
                "[*] Explore and map the codebase",
                "[*] Analyze dependencies",
                "[*] Send report to @manager",
            ],
            "@git": [
                "[*] Define branch strategy",
                "[*] Prepare commit messages with Trace ID",
                "[*] Perform rebase/merge operations if needed",
            ],
        };

        const specific = agentSpecific[agent] || [];
        return [...specific, ...base];
    }

    /**
     * Quality feedback loop — retries if @quality rejects
     * Uses real MCP calls, not simulations.
     */
    public static async qualityLoop(
        agent: string,
        taskDescription: string,
        maxRetries = 3
    ): Promise<{ success: boolean; attempts: number }> {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            logger.info(`[RETRY] Attempt ${attempt}/${maxRetries}: ${agent} running...`, {
                agent,
                attempt,
                maxRetries,
                task: taskDescription.substring(0, 100),
            });

            // Agent runs via MCP call
            const result = await this.runAgent(agent, taskDescription);

            // Quality check via MCP
            const qualityResult = await this.runQualityCheck(result);

            if (qualityResult.passed) {
                logger.info(`[OK] Quality check PASSED (attempt ${attempt})`, { agent, attempt });
                return { success: true, attempts: attempt };
            }

            logger.warn(`[FAIL] Quality check FAILED: ${qualityResult.reason}`, {
                agent,
                attempt,
                reason: qualityResult.reason,
            });
            logger.info(`[RETRY] ${agent} fixing errors...`, { agent, attempt });
        }

        logger.error(`[FAIL] ${maxRetries} attempts exhausted. Human intervention required.`, {
            agent,
            maxRetries,
            task: taskDescription.substring(0, 100),
        });
        return { success: false, attempts: maxRetries };
    }

    /**
     * Runs the agent through the Hermes messaging system.
     *
     * Flow:
     * 1. Write DELEGATION message to agent's queue (Storage.saveMessage)
     * 2. Wait for agent response (polling, max 30 seconds)
     * 3. Parse response and return as output
     */
    private static async runAgent(agent: string, task: string): Promise<string> {
        const agentName = agent.replace("@", "");
        const traceId = `T-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const messagePayload = JSON.stringify({
            type: "DELEGATION",
            task,
            traceId,
            from: "@manager",
        });

        AtabeyStorage.saveMessage({
            from: asAgentID("@manager"),
            to: asAgentID(agent),
            category: "DELEGATION" as const,
            content: messagePayload,
            traceId: asTraceID(traceId),
            timestamp: new Date().toISOString(),
            status: "PENDING" as const,
            priority: "HIGH" as const,
            requiresApproval: false,
        });

        logger.info(`[HERMES] Delegation sent to ${agent} (trace: ${traceId})`);

        // Poll for response (max 30 seconds)
        const maxAttempts = 60;
        const pollInterval = 500;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const messages = AtabeyStorage.getPendingMessages();
            const response = messages.find(
                m => m.from.replace("@", "") === agentName
                     && m.category === "RESPONSE"
                     && m.traceId === traceId
                     && m.status === "PENDING"
            );

            if (response) {
                if (response.id !== undefined) {
                    AtabeyStorage.updateMessageStatus(response.id as number, "PROCESSED");
                }
                logger.info(`[HERMES] Response received from ${agent} (trace: ${traceId})`);
                return response.content;
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        const timeoutMsg = `[TIMEOUT] ${agent} did not respond within 30s`;
        logger.warn(`[HERMES] ${timeoutMsg} (trace: ${traceId})`);
        return timeoutMsg;
    }

    /**
     * Runs quality control through the real QualityGate.
     *
     * Flow:
     * 1. QualityGate.check() for compliance + lint + test + content validation
     * 2. Aggregate results
     */
    private static async runQualityCheck(result: string): Promise<{ passed: boolean; reason: string }> {
        const { QualityGate } = await import("./quality-gate.js");
        const qualityResult = await QualityGate.check("@quality", result, "Quality check via routing engine");
        return {
            passed: qualityResult.passed,
            reason: qualityResult.reason,
        };
    }

    private static getCandidates(): RoutingCandidate[] {
        const frameworkDir = getFrameworkDir();
        const registryDir = path.join(frameworkDir, "registry");
        let candidates: RoutingCandidate[] = [];

        // 1. Control Plane Registry (actively registered agents)
        if (fs.existsSync(registryDir)) {
            const registryFiles = fs.readdirSync(registryDir).filter(f => f.endsWith("_active.json"));
            for (const file of registryFiles) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(registryDir, file), "utf8"));
                    if (data.agent && data.specialties) {
                        candidates.push({
                            agent: data.agent,
                            specialties: data.specialties,
                            displayName: data.displayName || data.agent,
                            role: data.role || "",
                            capability: data.capability || 8,
                            tier: data.tier || "core",
                        });
                    }
                } catch (err) {
                    logger.debug(`Failed to parse registry file: ${file}`, err);
                }
            }
        }

        // 2. Built-in agent definitions
        if (candidates.length === 0) {
            candidates = ALL_AGENTS.map(ag => ({
                agent: ag.name.startsWith("@") ? ag.name : `@${ag.name}`,
                specialties: ag.specialties ?? this.defaultSpecialties(ag.name),
                displayName: ag.displayName,
                role: ag.role,
                capability: ag.capability,
                tier: ag.tier,
            }));
        }

        return candidates;
    }

    /**
     * Default values for agents without a specialties field
     */
    private static defaultSpecialties(name: string): Record<string, number> {
        const defaults: Record<string, Record<string, number>> = {
            manager:   { orchestration: 10, governance: 10, delegation: 10, audit: 8, planning: 9 },
            architect: { design: 10, contract: 9, architecture: 10, types: 9, planning: 8 },
            backend:   { backend: 10, api: 9, logic: 9, service: 8, database: 7, test: 8 },
            frontend:  { frontend: 10, ui: 10, css: 9, html: 9, react: 9, responsive: 8 },
            mobile:    { mobile: 10, "react native": 9, expo: 8, offline: 8, accessibility: 7 },
            quality:   { audit: 10, compliance: 10, lint: 9, test: 9, coverage: 8 },
            database:  { database: 10, migration: 9, sql: 9, schema: 8, index: 8 },
            security:  { security: 10, auth: 9, encryption: 8, audit: 9, token: 8 },
            devops:    { devops: 10, docker: 9, ci: 9, deploy: 9, infra: 8 },
            analyst:   { analysis: 10, contract: 9, requirement: 9, validation: 8, documentation: 7 },
            native:    { native: 9, desktop: 8, "os-level": 8, security: 8 },
            explorer:  { discovery: 10, mapping: 9, dependency: 8, recon: 8 },
            git:       { git: 10, version: 9, commit: 8, branching: 8, traceability: 8 },
        };
        return defaults[name] || { general: 5 };
    }
}
