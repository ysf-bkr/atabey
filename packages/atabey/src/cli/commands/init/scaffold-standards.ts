import fs from "fs";
import path from "path";
import { CORE_SKILLS } from "../../../modules/skills/definitions.js";
import { logger } from "../../../shared/logger.js";
import { ensureDir, writeTextFile } from "../../utils/fs.js";
import { getPackageRoot } from "../../utils/pkg.js";

const FRAMEWORK_NAME = "Agent Atabey";

export function scaffoldSkills(skillsBaseDir: string, dryRun: boolean) {
    if (dryRun) return;
    ensureDir(skillsBaseDir, dryRun);
    for (const [key, skill] of Object.entries(CORE_SKILLS)) {
        const mdContent = `# [TOOL] ${FRAMEWORK_NAME} Skill — ${skill.name}\n\n${skill.description}\n\n## [PLUGIN] Associated Tools\n${skill.tools.map(t => `- \`${t}\``).join("\n")}\n\n## [SECURITY] Core Mandates\n${skill.mandates.join("\n")}\n`;
        writeTextFile(path.join(skillsBaseDir, `${key.toLowerCase()}.md`), mdContent);
    }
}

export function scaffoldStandards(frameworkDir: string, dryRun: boolean) {
    if (dryRun) return;
    const knowledgePath = path.join(frameworkDir, "knowledge");
    if (!fs.existsSync(knowledgePath)) fs.mkdirSync(knowledgePath, { recursive: true });

    const eslintStandardsContent = `# [ATABEY] Agent Atabey — ESLint Standards

This document outlines the strict ESLint coding standards for Agent Atabey projects.

## 📏 Core Rules
- **Indentation:** 4 spaces (strict).
- **Quotes:** Double quotes (\`"\`) for strings.
- **Semicolons:** Always terminate statements with a semicolon (\`;\`).
- **No Explicit Any:** Avoid using \`any\`. Use strongly typed interfaces, generics, or \`unknown\` with type assertions.
- **Unused Variables:** Warning on unused variables unless prefixed with an underscore (\`_\`).
`;
    writeTextFile(path.join(knowledgePath, "eslint-standards.md"), eslintStandardsContent);

    const standards = [
        // ── Supreme Governance (required by @manager, @security, @architect) ──────
        { file: "governance-standards.md", template: "templates/standards/governance-standards.md", default: "# [ATABEY] Agent Atabey — Governance & Order Standards" },
        // ── Core Engineering Standards ────────────────────────────────────────────
        { file: "crud-governance.md", template: "templates/standards/crud-governance.md", default: "# [GOV] Corporate CRUD and Governance Standards" },
        { file: "architecture-standards.md", template: "templates/standards/architecture-standards.md", default: "# 📐 Corporate Architecture Standards" },
        { file: "frontend-standards.md", template: "templates/standards/frontend-standards.md", default: "# 🎨 Corporate Frontend Standards" },
        { file: "vite-standards.md", template: "templates/standards/vite-standards.md", default: "# ⚡ Corporate Vite Standards" },
        { file: "nextjs-standards.md", template: "templates/standards/nextjs-standards.md", default: "# [REACT] Corporate Next.js Standards" },
        { file: "tailwind-standards.md", template: "templates/standards/tailwind-standards.md", default: "# 🌊 Corporate Tailwind Standards" },
        { file: "mobile-standards.md", template: "templates/standards/mobile-standards.md", default: "# 📱 Corporate Mobile Standards" },
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
        { file: "vitest-standards.md", template: "templates/standards/vitest-standards.md", default: "# [TEST] Vitest Unit Testing Standards" }
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
