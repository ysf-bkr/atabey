import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getPackageVersion } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

/**
 * Run ESLint for the current project (delegates to `npm run lint`).
 * Gives a friendly message when the project has no `lint` script configured.
 */
export async function lintCommand(): Promise<void> {
    UI.info(`Running ESLint (v${getPackageVersion()})...`);
    const projectRoot = process.cwd();

    let hasLintScript = false;
    try {
        const pkgPath = path.join(projectRoot, "package.json");
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
            hasLintScript = Boolean(pkg.scripts?.lint);
        }
    } catch {
        /* treat as no script */
    }

    if (!hasLintScript) {
        UI.error("No \"lint\" script found in this project's package.json.");
        UI.info("Add one (e.g. \"lint\": \"eslint .\") plus an eslint.config.js, then re-run `atabey lint`.");
        process.exit(1);
    }

    try {
        execSync("npm run lint", {
            cwd: projectRoot,
            stdio: "inherit",
            env: process.env,
        });
        UI.success("ESLint passed with no errors.");
    } catch {
        UI.error("ESLint reported errors. Fix violations before committing.");
        UI.info("Tip: npm run lint -- --fix");
        process.exit(1);
    }
}
