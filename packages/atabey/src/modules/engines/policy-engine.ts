/**
 * [ENGINE] Policy Engine — Language, CLI, Dashboard & Parallel Rules
 *
 * Combines remaining vision items:
 * 5. API Versioning Strategy — URL versioning enforcement
 * 7. Dashboard Live Features — WebSocket ApprovalCenter, CompliancePanel
 * 8. CLI Command Map — .atabey/cli-commands.json management
 * 9. Language Policy Enforcer — English-only comments/variables
 * 10. Parallel Execution Rules — dependency lock, ownership, commit logging
 */

import fs from "fs";
import path from "path";
import { logger } from "../../shared/logger.js";
import { AtabeyStorage } from "../../shared/storage.js";

export interface CliCommandEntry {
    command: string;
    agent: string;
    description: string;
    outputFormat?: "json" | "text";
}

export interface LanguageViolation {
    file: string;
    line: number;
    type: "turkish_comment" | "non_english_variable" | "ui_text_not_english";
    content: string;
}

/**
 * Policy Engine — enforces language policy, manages CLI command map,
 * provides dashboard live data, and enforces parallel execution rules.
 */
export class PolicyEngine {
    // ─── 5. API Versioning Strategy ──────────────────────────────────

    /**
     * Validates that API endpoints use versioned paths (/api/v{N}/...).
     */
    public static validateApiVersioning(filePath: string, content: string): string[] {
        const violations: string[] = [];
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // Check for route definitions without version prefix
            const routeMatch = line.match(/\.(get|post|put|delete|patch)\(['"`]\/api\/(?!v\d+\/)/i);
            if (routeMatch) {
                violations.push(`Line ${i + 1}: API route without version prefix: ${line.trim()}`);
            }
        }
        return violations;
    }

    // ─── 7. Dashboard Live Data ─────────────────────────────────────

    /**
     * Returns dashboard live data for WebSocket broadcast.
     */
    public static getDashboardData(): Record<string, unknown> {
        return {
            agents: AtabeyStorage.getAllAgents().map(a => ({ name: a.name, state: a.state, task: a.task })),
            pendingApprovals: AtabeyStorage.getPendingMessages()
                .filter(m => m.category === "ALERT" || m.category === "ACTION")
                .map(m => ({ traceId: m.traceId, description: m.content?.substring(0, 100), status: m.status })),
            messageQueue: {
                pending: AtabeyStorage.getPendingMessages().length,
                categories: AtabeyStorage.getPendingMessages().reduce((acc: Record<string, number>, m) => {
                    acc[m.category] = (acc[m.category] || 0) + 1;
                    return acc;
                }, {}),
            },
            activeTraceId: AtabeyStorage.getMetadata("traceId") || "N/A",
            currentPhase: AtabeyStorage.getMetadata("phase") || "PHASE_0",
        };
    }

    // ─── 8. CLI Command Map Management ──────────────────────────────

    /**
     * Gets the CLI command map from .atabey/cli-commands.json.
     */
    public static getCliCommands(): CliCommandEntry[] {
        const cmdsPath = path.join(process.cwd(), ".atabey", "cli-commands.json");
        if (!fs.existsSync(cmdsPath)) return PolicyEngine.getDefaultCommands();
        try {
            return JSON.parse(fs.readFileSync(cmdsPath, "utf8"));
        } catch {
            return PolicyEngine.getDefaultCommands();
        }
    }

    /**
     * Saves CLI command map.
     */
    public static saveCliCommand(command: CliCommandEntry): void {
        const cmdsDir = path.join(process.cwd(), ".atabey");
        const cmdsPath = path.join(cmdsDir, "cli-commands.json");
        if (!fs.existsSync(cmdsDir)) fs.mkdirSync(cmdsDir, { recursive: true });

        const commands = PolicyEngine.getCliCommands();
        const existing = commands.findIndex(c => c.command === command.command);
        if (existing >= 0) {
            commands[existing] = command;
        } else {
            commands.push(command);
        }
        fs.writeFileSync(cmdsPath, JSON.stringify(commands, null, 2));
    }

    private static getDefaultCommands(): CliCommandEntry[] {
        return [
            { command: "atabey status", agent: "@manager", description: "Show system status" },
            { command: "atabey approve", agent: "@human", description: "Approve a high-risk operation", outputFormat: "json" },
            { command: "atabey trace:new", agent: "@manager", description: "Create a new trace" },
            { command: "atabey verify-contract", agent: "@architect", description: "Verify contract integrity" },
            { command: "atabey mcp setup", agent: "@manager", description: "Setup MCP server" },
        ];
    }

    // ─── 9. Language Policy Enforcer ────────────────────────────────

    /**
     * Scans files for language policy violations.
     * Rules: comments in English, variable/function names in English, UI text in English.
     */
    public static scanLanguagePolicy(filePath: string, content: string): LanguageViolation[] {
        const violations: LanguageViolation[] = [];
        const lines = content.split("\n");
        // Detector data only: common non-English (TR) stop-words used to flag comments
        // that violate the English-only content policy. Not user-facing copy.
        const nonEnglishCommentPatterns = [
            /\b(bu|şu|o|ve|veya|ile|için|göre|kadar|sonra|önce|ama|fakat|çünkü|eğer|her|bir|daha|en|çok|az|yeni|eski|büyük|küçük|iyi|kötü|doğru|yanlış)\b/i,
            /\b(yap|et|git|gel|bak|ver|al|tut|koş|dur|otur|kalk|aç|kapa|çalış|oku|yaz|sil|ekle|güncelle|sil|temizle)\b/i,
        ];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines, pure code, and URLs
            if (!line || line.startsWith("// @") || line.startsWith("import") || line.startsWith("export") || line.includes("http")) continue;

            // Flag comments that look non-English (policy: product content is English)
            const commentMatch = line.match(/\/\/\s*(.+)/);
            if (commentMatch) {
                const comment = commentMatch[1];
                if (nonEnglishCommentPatterns.some(p => p.test(comment))) {
                    violations.push({ file: filePath, line: i + 1, type: "turkish_comment", content: comment.substring(0, 80) });
                }
            }
        }

        return violations;
    }

    // ─── 10. Parallel Execution Rules ───────────────────────────────

    /**
     * Checks implicit dependency lock — if an agent's required output
     * is not ready, the dependent agent switches to WAITING state.
     */
    public static checkImplicitDependency(agentName: string, requiredAgent: string): boolean {
        const agents = AtabeyStorage.getAllAgents();
        const required = agents.find(a => a.name === requiredAgent);

        if (!required || required.state !== "COMPLETED") {
            AtabeyStorage.updateAgentStatus(agentName, "WAITING", `Waiting for ${requiredAgent} to complete`);
            logger.info(`[PARALLEL] ${agentName} → WAITING (dependency: ${requiredAgent} not ready)`);
            return false;
        }
        return true;
    }

    /**
     * Enforces file ownership — an agent cannot modify files outside its scope.
     */
    public static enforceOwnership(agentName: string, filePath: string): boolean {
        const ownershipMap: Record<string, string[]> = {
            "@backend": ["src/modules/", "src/contracts/", "apps/backend/"],
            "@frontend": ["apps/web/", "src/components/", "src/pages/"],
            "@database": ["src/database/", "migrations/"],
            "@devops": [".github/", "Dockerfile", "docker-compose", ".env"],
            "@architect": ["src/contracts/", "src/types/", "contract.version.json"],
        };

        const allowedPaths = ownershipMap[agentName];
        if (!allowedPaths) return true; // No restriction for this agent

        const relativePath = path.relative(process.cwd(), filePath);
        const isAllowed = allowedPaths.some(p => relativePath.startsWith(p) || relativePath.includes(p));

        if (!isAllowed) {
            logger.warn(`[OWNERSHIP] ${agentName} cannot modify ${filePath} — outside scope`);
            AtabeyStorage.saveLog({
                agent: agentName.replace("@", ""),
                action: "OWNERSHIP_VIOLATION",
                trace_id: AtabeyStorage.getMetadata("traceId") || "N/A",
                status: "BLOCKED",
                summary: `${agentName} attempted to modify ${filePath} — outside allowed scope: ${allowedPaths.join(", ")}`
            });
            return false;
        }
        return true;
    }

    /**
     * Logs commit-level information for traceability.
     */
    public static logCommit(agentName: string, message: string, traceId: string): void {
        AtabeyStorage.saveLog({
            agent: agentName.replace("@", ""),
            action: "COMMIT",
            trace_id: traceId,
            status: "SUCCESS",
            summary: `[${traceId}] ${message.substring(0, 200)}`
        });

        logger.info(`[COMMIT] ${agentName}: ${message} (trace: ${traceId})`);
    }
}
