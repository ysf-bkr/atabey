import { execSync } from "child_process";
import { getPackageVersion } from "../utils/pkg.js";
import { UI } from "../utils/ui.js";

/**
 * Run ESLint for the project (same as npm run lint).
 */
export async function lintCommand(): Promise<void> {
    UI.info(`Running ESLint (v${getPackageVersion()})...`);
    const projectRoot = process.cwd();
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
