import fs from "fs";
import path from "path";
import { logger } from "../../../shared/logger.js";
import { writeTextFile } from "../../utils/fs.js";
import { getPackageRoot } from "../../utils/pkg.js";
import { UI } from "../../utils/ui.js";

export function scaffoldProjectDocs(projectRoot: string, options: { backendLanguage: string; frontendFramework?: string }, dryRun: boolean) {
    if (dryRun) return;

    const docsDir = path.join(projectRoot, "docs");
    if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

    // Scaffold tech-stack.md with dynamic content
    const techStackPath = path.join(docsDir, "tech-stack.md");
    let techStackContent = "";

    try {
        const templatePath = path.join(getPackageRoot(), "docs/tech-stack.md");
        if (fs.existsSync(templatePath)) {
            techStackContent = fs.readFileSync(templatePath, "utf8");

            // Replace the backend language in the template
            const lang = options.backendLanguage;
            const frontend = options.frontendFramework || "Vite (React)";

            techStackContent = techStackContent.replace(
                /\| \*\*Geliştirme Ortamı\*\* \| .* \|/,
                `| **Geliştirme Ortamı** | ${lang} |`
            );

            techStackContent = techStackContent.replace(
                /\| \*\*Frontend Altyapısı\*\* \| .* \|/,
                `| **Frontend Altyapısı** | ${frontend} |`
            );
        }
    } catch (e) {
        logger.debug("Failed to read tech-stack.md template", e);
    }

    if (!techStackContent) {
        techStackContent = `# [TOOL] Project Tech Stack\n\n- **Backend Language:** ${options.backendLanguage}\n- **Frontend Framework:** ${options.frontendFramework || "Vite (React)"}\n`;
    }

    writeTextFile(techStackPath, techStackContent);
    UI.success(` Project documentation updated: docs/tech-stack.md (Backend: ${options.backendLanguage}, Frontend: ${options.frontendFramework || "Vite (React)"})`);
}
