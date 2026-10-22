import fs from "fs";
import path from "path";
import { CORE_SKILLS } from "../../../modules/skills/definitions.js";
import { logger } from "../../../shared/logger.js";
import { ensureDir, writeTextFile } from "../../utils/fs.js";
import { getPackageRoot } from "../../utils/pkg.js";
import { UI } from "../../utils/ui.js";

const FRAMEWORK_NAME = "Atabey";

/** Kebab-case directory slug for a skill (e.g. "DevOps Infrastructure" → "devops-infrastructure"). */
function skillSlug(key: string): string {
    return key
        .toLowerCase()
        .trim()
        .replace(/[_\s]+/g, "-")
        .replace(/[^a-z0-9-]/g, "");
}

/**
 * Scaffolds the 15 core skills in the platform-discoverable directory format:
 *   skills/<skill-slug>/SKILL.md   (YAML frontmatter: name, description, tools)
 * Claude Code, Antigravity, Gemini-style runtimes and the AGENTS.md ecosystem
 * all auto-discover this layout; flat `skills/<name>.md` files are not found.
 */
export function scaffoldSkills(skillsBaseDir: string, dryRun: boolean) {
    if (dryRun) return;
    ensureDir(skillsBaseDir, dryRun);
    for (const [key, skill] of Object.entries(CORE_SKILLS)) {
        const skillDir = path.join(skillsBaseDir, skillSlug(key));
        if (!fs.existsSync(skillDir)) fs.mkdirSync(skillDir, { recursive: true });

        const frontmatter = [
            "---",
            `name: ${skill.name}`,
            `description: ${skill.description.replace(/\s+/g, " ").trim()}`,
            `tools: ${skill.tools.join(", ")}`,
            "---",
        ].join("\n");

        const mdContent = `${frontmatter}\n\n# [TOOL] ${FRAMEWORK_NAME} Skill — ${skill.name}\n\n${skill.description}\n\n## [PLUGIN] Associated Tools\n${skill.tools.map(t => `- \`${t}\``).join("\n")}\n\n## [SECURITY] Core Mandates\n${skill.mandates.join("\n")}\n`;
        writeTextFile(path.join(skillDir, "SKILL.md"), mdContent);

        // Remove legacy flat skill file from older Atabey layouts.
        const legacyFlat = path.join(skillsBaseDir, `${key.toLowerCase()}.md`);
        if (fs.existsSync(legacyFlat)) {
            fs.rmSync(legacyFlat, { force: true });
            UI.success(`Removed legacy flat skill → ${path.relative(process.cwd(), legacyFlat)}`);
        }
    }
}

export function scaffoldStandards(frameworkDir: string, dryRun: boolean) {
    if (dryRun) return;
    const knowledgePath = path.join(frameworkDir, "knowledge");
    if (!fs.existsSync(knowledgePath)) fs.mkdirSync(knowledgePath, { recursive: true });

    const standards = [
        // ── Supreme Governance (required by @manager, @security, @architect) ──────
        { file: "governance-standards.md", template: "templates/standards/governance-standards.md", default: "# [ATABEY] Atabey — Governance & Order Standards" },
        // ── Core Engineering Standards ────────────────────────────────────────────
        { file: "crud-governance.md", template: "templates/standards/crud-governance.md", default: "# [GOV] Corporate CRUD and Governance Standards" },
        { file: "architecture-standards.md", template: "templates/standards/architecture-standards.md", default: "# 📐 Corporate Architecture Standards" },
        { file: "frontend-standards.md", template: "templates/standards/frontend-standards.md", default: "# 🎨 Corporate Frontend Standards" },
        { file: "vite-standards.md", template: "templates/standards/vite-standards.md", default: "# ⚡ Corporate Vite Standards" },
        { file: "nextjs-standards.md", template: "templates/standards/nextjs-standards.md", default: "# [REACT] Corporate Next.js Standards" },
        { file: "tailwind-standards.md", template: "templates/standards/tailwind-standards.md", default: "# 🌊 Corporate Tailwind Standards" },
        { file: "mobile-standards.md", template: "templates/standards/mobile-standards.md", default: "# 📱 Corporate Mobile Standards" },
        { file: "android-standards.md", template: "templates/standards/android-standards.md", default: "# 🤖 Corporate Android Industrial Development Standards" },
        { file: "ios-standards.md", template: "templates/standards/ios-standards.md", default: "# 🍏 Corporate iOS Industrial Development Standards" },
        { file: "mobile-notifications-standards.md", template: "templates/standards/mobile-notifications-standards.md", default: "# 🔔 Corporate Mobile Push Notification Standards (FCM & APNs)" },
        { file: "native-standards.md", template: "templates/standards/native-standards.md", default: "# [NATIVE] Corporate Native / Platform-Layer Standards (Rust / Go)" },
        { file: "security-standards.md", template: "templates/standards/security-standards.md", default: "# [SECURITY] Corporate Security Standards" },
        { file: "quality-standards.md", template: "templates/standards/quality-standards.md", default: "# [CHECK] Corporate Code Quality Standards" },
        { file: "logging-and-secrets.md", template: "templates/standards/logging-and-secrets.md", default: "# 🪵 Corporate Logging Standards" },
        { file: "testing-standards.md", template: "templates/standards/testing-standards.md", default: "# [SKILL] Corporate Testing Standards" },
        { file: "i18n-standards.md", template: "templates/standards/i18n-standards.md", default: "# [LANG] Corporate i18n Standards" },
        { file: "llm-governance.md", template: "templates/standards/llm-governance.md", default: "# [AI] LLM Governance Standards" },
        { file: "observability-standards.md", template: "templates/standards/observability-standards.md", default: "# 📈 Corporate Observability Standards" },
        { file: "deployment-standards.md", template: "templates/standards/deployment-standards.md", default: "# [START] Corporate Deployment Standards" },
        { file: "performance-standards.md", template: "templates/standards/performance-standards.md", default: "# ⚡ Corporate Performance Standards" },
        { file: "security-audit-standards.md", template: "templates/standards/security-audit-standards.md", default: "# [OK] Corporate Security Audit Standards" },
        // ── Additional Specialized Framework Standards ───────────────────────────
        { file: "auth-standards.md", template: "templates/standards/auth-standards.md", default: "# [SECURITY] Corporate Auth Standards" },
        { file: "github-actions-standards.md", template: "templates/standards/github-actions-standards.md", default: "# [OPS] GitHub Actions CI/CD Standards" },
        { file: "kysely-standards.md", template: "templates/standards/kysely-standards.md", default: "# [DB] Kysely Type-safe SQL Standards" },
        { file: "pino-standards.md", template: "templates/standards/pino-standards.md", default: "# [LOG] Pino Structured Logging Standards" },
        { file: "playwright-standards.md", template: "templates/standards/playwright-standards.md", default: "# [TEST] Playwright E2E Testing Standards" },
        { file: "react-query-standards.md", template: "templates/standards/react-query-standards.md", default: "# [REACT] React Query State Management Standards" },
        { file: "react-router-standards.md", template: "templates/standards/react-router-standards.md", default: "# [REACT] React Router Navigation Standards" },
        { file: "swagger-standards.md", template: "templates/standards/swagger-standards.md", default: "# [API] Swagger / OpenAPI Standards" },
        { file: "typeorm-standards.md", template: "templates/standards/typeorm-standards.md", default: "# [DB] TypeORM ORM Standards" },
        { file: "vitest-standards.md", template: "templates/standards/vitest-standards.md", default: "# [TEST] Vitest Unit Testing Standards" },
        // ── Reporting, Enterprise, Token Economy & UI ────────────────────────────
        { file: "reporting-standards.md", template: "templates/standards/reporting-standards.md", default: "# [REPORT] Corporate Reporting Standards" },
        { file: "enterprise-systems-standards.md", template: "templates/standards/enterprise-systems-standards.md", default: "# [ENTERPRISE] Enterprise Systems Standards" },
        { file: "eslint-standards.md", template: "templates/standards/eslint-standards.md", default: "# [ATABEY] Atabey — ESLint Standards" },
        { file: "token-economy.md", template: "templates/standards/token-economy.md", default: "# [TOKEN] Token Economy & Context Management Standards" }
    ];

    for (const std of standards) {
        let content = std.default;
        try {
            const fullTemplatePath = path.join(getPackageRoot(), std.template);
            if (fs.existsSync(fullTemplatePath)) {
                content = fs.readFileSync(fullTemplatePath, "utf8");
            }
        } catch (err) {
            // Fallback to default content
            logger.warn(`Failed to read template ${std.template}, using default`, err);
        }
        writeTextFile(path.join(knowledgePath, std.file), content);
    }
}
