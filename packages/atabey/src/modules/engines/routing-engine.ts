import fs from "fs";
import path from "path";
import { getFrameworkDir } from "../../cli/utils/memory.js";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";
import { asAgentID, asTraceID } from "../../shared/types.js";
import { ALL_AGENTS } from "../agents/definitions.js";
import { generateEmbedding as embedText } from "../memory/embedding.js";

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
     *
     * Semantic routing via `resolveWithEmbeddings()` blends TF-IDF scores
     * with cosine similarity over local TF-IDF embeddings (or OpenAI embeddings
     * when OPENAI_API_KEY is set). Use the async variant for higher accuracy.
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
        let bestHasRealMatch = false;

        for (const candidate of candidates) {
            let score = 0;
            const matches: string[] = [];

            // 1. Specialty matching (weighted TF-IDF)
            for (const [specialty, weight] of Object.entries(candidate.specialties)) {
                const specTokens = this.tokenize(specialty.toLowerCase());
                for (const token of tokens) {
                    if (specTokens.some(st => this.matchesToken(token, st))) {
                        score += weight * this.calculateTfIdf(token, tokens, candidates);
                        matches.push(specialty);
                    }
                }
            }

            // 2. Role matching
            const roleTokens = this.tokenize(candidate.role.toLowerCase());
            for (const token of tokens) {
                if (roleTokens.some(rt => this.matchesToken(token, rt))) {
                    score += 3; // Role match bonus
                    matches.push(`role:${candidate.role}`);
                }
            }

            // 3. DisplayName matching
            const nameTokens = this.tokenize(candidate.displayName.toLowerCase());
            for (const token of tokens) {
                if (nameTokens.some(nt => this.matchesToken(token, nt))) {
                    score += 2;
                    matches.push(`name:${candidate.displayName}`);
                }
            }

            // Capability bonus (more capable agents get priority)
            score += (candidate.capability - 5) * 0.5;

            if (score > bestScore) {
                bestScore = score;
                bestAgent = candidate.agent;
                bestHasRealMatch = matches.length > 0;
                bestReasoning = bestHasRealMatch
                    ? `Matching fields: ${[...new Set(matches)].join(", ")}`
                    : "Selected based on general capability";
                bestSubTasks = this.generateSubTasks(candidate.agent, taskDescription);
            }
        }

        // Static keyword fallback: fires when the best candidate won purely on
        // capability (no specialty/role/name match) — e.g. short or non-English
        // tasks where TF-IDF has no signal. Constrained to the active profile.
        if (!bestHasRealMatch) {
            const allowed = this.getConfiguredAgents(getFrameworkDir());
            const fallback = this.fallbackRouting(tokens, allowed);
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

    // ─── Semantic Routing (Embedding-based) ─────────────────────────────────

    /**
     * Semantic routing via embedding cosine similarity.
     *
     * Blends TF-IDF score (60%) with embedding cosine similarity (40%).
     * Falls back gracefully to pure TF-IDF when embeddings are unavailable.
     *
     * When OPENAI_API_KEY is set, uses text-embedding-3-small (1536-dim).
     * Otherwise falls back to the local TF-IDF vectorizer (384-dim) from
     * CoreMemory.generateEmbedding(), which is already used by the memory system.
     *
     * @param taskDescription - Natural language task to route
     * @returns Routing result with semantic score blend
     */
    public static async resolveWithEmbeddings(taskDescription: string): Promise<RoutingResult> {
        // Start TF-IDF routing in parallel with embedding generation
        const tfidfResult = this.resolveWithDetails(taskDescription);

        try {
            const taskVector = await embedText(taskDescription); // honors OPENAI_API_KEY, falls back to local TF-IDF
            const candidates = this.getCandidates();

            let bestAgent = tfidfResult.agent;
            let bestBlendedScore = -Infinity;
            let bestReasoning = tfidfResult.reasoning;

            for (const candidate of candidates) {
                // Build a combined specialty text for this agent to embed
                const specialtyText = Object.keys(candidate.specialties).join(" ") +
                    " " + candidate.role + " " + candidate.displayName;
                const agentVector = await embedText(specialtyText);

                const similarity = this.cosineSimilarity(taskVector, agentVector);

                // Retrieve TF-IDF score for this specific candidate
                const candidateTfIdfScore = this.scoreSingleCandidate(
                    taskDescription, candidate, candidates
                );

                // Blend: 60% TF-IDF score (normalized 0-1) + 40% cosine similarity
                const normalizedTfIdf = Math.min(candidateTfIdfScore / 30, 1);
                const blendedScore = normalizedTfIdf * 0.6 + similarity * 0.4;

                if (blendedScore > bestBlendedScore) {
                    bestBlendedScore = blendedScore;
                    bestAgent = candidate.agent;
                    bestReasoning = `Semantic blend (TF-IDF: ${(normalizedTfIdf * 100).toFixed(0)}%, cosine: ${(similarity * 100).toFixed(0)}%) → ${candidate.role}`;
                }
            }

            const confidence: "high" | "medium" | "low" =
                bestBlendedScore > 0.6 ? "high"
                    : bestBlendedScore > 0.35 ? "medium"
                        : "low";

            // If confidence is too low or ambiguous, route to @manager for clarification
            if (bestBlendedScore < 0.25) {
                bestAgent = "@manager";
                bestReasoning = `Low confidence (${(bestBlendedScore * 100).toFixed(0)}%): routed to @manager for requirement clarification.`;
            }

            logger.debug(`[ROUTING] Semantic routing selected ${bestAgent} (blend score: ${bestBlendedScore.toFixed(3)})`);

            return {
                agent: bestAgent,
                score: Math.round(bestBlendedScore * 100) / 100,
                confidence,
                reasoning: bestReasoning,
                subTasks: this.generateSubTasks(bestAgent, taskDescription),
            };
        } catch (err) {
            // Graceful fallback to TF-IDF if embedding fails
            logger.warn(`[ROUTING] Embedding-based routing failed, falling back to TF-IDF: ${(err as Error).message}`);
            return tfidfResult;
        }
    }

    /**
     * Scores a single candidate against a task using TF-IDF.
     * Extracted from resolveWithDetails to support semantic blend calculation.
     */
    private static scoreSingleCandidate(
        taskDescription: string,
        candidate: RoutingCandidate,
        allCandidates: RoutingCandidate[]
    ): number {
        const textLower = taskDescription.toLowerCase();
        const tokens = this.tokenize(textLower);
        let score = 0;

        for (const [specialty, weight] of Object.entries(candidate.specialties)) {
            const specTokens = this.tokenize(specialty.toLowerCase());
            for (const token of tokens) {
                if (specTokens.some(st => this.matchesToken(token, st))) {
                    score += weight * this.calculateTfIdf(token, tokens, allCandidates);
                }
            }
        }
        score += (candidate.capability - 5) * 0.5;
        return score;
    }

    /**
     * Cosine similarity between two numeric vectors.
     * Returns a value in [0, 1] where 1 = identical direction.
     */
    private static cosineSimilarity(a: number[], b: number[]): number {
        const len = Math.min(a.length, b.length);
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < len; i++) {
            dot   += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : Math.max(0, dot / denom);
    }

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

    /**
     * Turkish filler words that must not contribute to routing scores.
     * Turkish is agglutinative; without this filter, particles like "icin"
     * or "bir" spuriously substring-match English specialties/roles.
     * Tokens are already diacritic-stripped by `tokenize`.
     */
    private static readonly TURKISH_STOPWORDS = new Set([
        "ve", "ile", "icin", "bir", "bu", "su", "gibi", "daha", "kadar",
        "olarak", "her", "hangi", "sonra", "once", "mi", "mı", "mu", "mü",
    ]);

    private static tokenize(text: string): string[] {
        return text
            .replace(/İ/g, "i")
            .replace(/I/g, "ı")
            .toLowerCase()
            .replace(/ç/g, "c")
            .replace(/ğ/g, "g")
            .replace(/ı/g, "i")
            .replace(/ö/g, "o")
            .replace(/ş/g, "s")
            .replace(/ü/g, "u")
            .replace(/[^a-z0-9 ]/g, " ")
            .split(/\s+/)
            .filter(t => t.length > 1 && !RoutingEngine.TURKISH_STOPWORDS.has(t));
    }

    /**
     * Keyword match tolerant of Turkish agglutinative suffixes:
     * "kalitesi" matches "kalite", "sayfasi" matches "sayfa".
     * Prefix matching also handles English plurals ("apis" → "api").
     */
    private static matchesKeyword(token: string, keyword: string): boolean {
        return token === keyword || token.startsWith(keyword);
    }

    /**
     * Guarded token match for TF-IDF scoring. Short stems (e.g. "ci", "os",
     * "al", "git") match ONLY exactly — otherwise they spuriously substring-match
     * inside longer agglutinative words (Turkish "kullanici" contains "ci",
     * "mikroservis" contains "os", "dagitimi" contains "git"). Longer stems
     * allow prefix matching to tolerate plurals/suffixes ("authentication" →
     * "auth", "apis" → "api").
     */
    private static matchesToken(token: string, stem: string): boolean {
        if (token === stem) return true;
        if (stem.length >= 4 && token.startsWith(stem)) return true;
        if (token.length >= 4 && stem.startsWith(token)) return true;
        return false;
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

    private static fallbackRouting(tokens: string[], allowed?: Set<string> | null): { agent: string; reasoning: string; subTasks: string[] } {
        const text = tokens.join(" ");
        const has = (keywords: string[]) => tokens.some(t => keywords.some(k => this.matchesKeyword(t, k)));

        // Profile guard: the keyword fallback must never assign work to an
        // agent that is not scaffolded in the active profile.
        const route = (agent: string, reasoning: string): { agent: string; reasoning: string; subTasks: string[] } => {
            if (allowed && !allowed.has(agent.replace(/^@/, ""))) {
                return {
                    agent: "@manager",
                    reasoning: "Ambiguous task intent: routed to @manager for coordination or user clarification",
                    subTasks: this.generateSubTasks("@manager", text),
                };
            }
            return { agent, reasoning, subTasks: this.generateSubTasks(agent, text) };
        };

        if (has(["backend","api","endpoint","rest","graphql","controller","middleware","servis"])) {
            return route("@backend", "Backend/API keywords detected");
        }
        if (has(["frontend","ui","page","css","html","react","component","button","form","modal","table","interface","arayuz","sayfa","bilesen"])) {
            return route("@frontend", "Frontend/UI keywords detected");
        }
        if (has(["security","auth","token","encrypt","login","guvenlik","sifreleme","yetki"])) {
            return route("@security", "Security keywords detected");
        }
        if (has(["database","migration","sql","schema","table","index","query","veritabani","tablo"])) {
            return route("@database", "Database keywords detected");
        }
        if (has(["test","quality","qa","lint","coverage","denetim","kalite"])) {
            return route("@quality", "Quality/Testing keywords detected");
        }
        if (has(["docker","ci","cd","deploy","devops","infra","server","nginx","dagitim","sunucu"])) {
            return route("@devops", "DevOps/Infra keywords detected");
        }
        if (has(["mobile","expo","ios","android","flutter"])) {
            return route("@mobile", "Mobile keywords detected");
        }
        if (has(["architect","design","architecture","contract","structure","mimari","tasarla"])) {
            return route("@architect", "Architecture/design keywords detected");
        }
        if (has(["analysis","analyst","requirement","validate","analiz","gereksinim"])) {
            return route("@analyst", "Analysis/requirement keywords detected");
        }

        return {
            agent: "@manager",
            reasoning: "Ambiguous task intent: routed to @manager for coordination or user clarification",
            subTasks: this.generateSubTasks("@manager", text),
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
                "[*] Run compliance check (check_architecture_compliance)",
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

        // Poll for response (max 10 seconds — consistent with AgentExecutor.pollForAgentResponse)
        const maxAttempts = 20;
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

        const timeoutMsg = `[TIMEOUT] ${agent} did not respond within ${(maxAttempts * pollInterval) / 1000}s`;
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

    private static candidatesCache: RoutingCandidate[] | null = null;
    private static candidatesCacheTime = 0;
    private static readonly CACHE_TTL_MS = 30_000; // 30 seconds

    /** Clears the candidate cache (used when the active profile changes or in tests). */
    public static resetCache(): void {
        this.candidatesCache = null;
        this.candidatesCacheTime = 0;
    }

    private static getConfiguredAgents(frameworkDir: string): Set<string> | null {
        try {
            const configPath = path.join(frameworkDir, "config.json");
            if (!fs.existsSync(configPath)) return null;
            const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as { agents?: string[] };
            if (!Array.isArray(config.agents) || config.agents.length === 0) return null;
            return new Set(config.agents.map((a) => a.replace(/^@/, "")));
        } catch {
            return null;
        }
    }

    private static getCandidates(): RoutingCandidate[] {
        const now = Date.now();
        if (this.candidatesCache && (now - this.candidatesCacheTime) < this.CACHE_TTL_MS) {
            return this.candidatesCache;
        }

        const frameworkDir = getFrameworkDir();
        const registryDir = path.join(frameworkDir, "registry");
        // Respect the active profile: a freelancer project only has 4 agents
        // scaffolded, so routing must never assign work to absent specialists.
        const enabledAgents = this.getConfiguredAgents(frameworkDir);
        const isEnabled = (agent: string): boolean =>
            !enabledAgents || enabledAgents.has(agent.replace(/^@/, ""));
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
            candidates = candidates.filter((c) => isEnabled(c.agent));
        }

        // 2. Built-in agent definitions
        if (candidates.length === 0) {
            const builtIns = ALL_AGENTS.filter((ag) => isEnabled(ag.name));
            const source = builtIns.length > 0 ? builtIns : ALL_AGENTS;
            candidates = source.map(ag => ({
                agent: ag.name.startsWith("@") ? ag.name : `@${ag.name}`,
                specialties: ag.specialties ?? this.defaultSpecialties(ag.name),
                displayName: ag.displayName,
                role: ag.role,
                capability: ag.capability,
                tier: ag.tier,
            }));
        }

        this.candidatesCache = candidates;
        this.candidatesCacheTime = now;
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
