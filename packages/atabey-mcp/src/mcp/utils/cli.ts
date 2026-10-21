import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { logger } from "../../shared/logger.js";

/**
 * Executes a command safely and returns the output.
 */
export function safeExec(cmd: string, args: string[], cwd: string, timeout = 30000): string {
    try {
        return execFileSync(cmd, args, { cwd, timeout, encoding: "utf8", stdio: "pipe" });
    } catch (err: unknown) {
        const error = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
        return error.stdout?.toString() || error.stderr?.toString() || error.message || String(err);
    }
}

/**
 * Resolves the directory where language-specific lint/test commands should run.
 *
 * Consumer projects scaffold their app under `.atabey/config.json#paths.backend`
 * (usually `apps/backend`) and keep the `lint`/`test` scripts in that package.
 * Running the command at the repository root would fail with "Missing script".
 * In the framework monorepo (or a custom layout without a backend manifest) the
 * project root is used.
 */
export function getExecutionCwd(projectRoot: string): string {
    try {
        const configPath = path.join(projectRoot, ".atabey", "config.json");
        if (!fs.existsSync(configPath)) return projectRoot;
        const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
            paths?: { backend?: string };
        };
        const backendRel = config.paths?.backend;
        if (!backendRel) return projectRoot;

        const candidate = path.join(projectRoot, backendRel);
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isDirectory()) return projectRoot;

        const manifests = ["package.json", "go.mod", "Cargo.toml", "pom.xml", "requirements.txt", "pyproject.toml"];
        const hasManifest =
            manifests.some((m) => fs.existsSync(path.join(candidate, m))) ||
            fs.readdirSync(candidate).some((f) => f.endsWith(".csproj"));
        return hasManifest ? candidate : projectRoot;
    } catch {
        return projectRoot;
    }
}

/**
 * Detects the backend language from the framework configuration.
 */
export function getBackendLanguage(projectRoot: string): string {
    try {
        const configPath = path.join(projectRoot, ".atabey", "config.json");
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            return config.backendLanguage || "Node.js (TypeScript)";
        }
    } catch (err) {
        logger.debug("Failed to read backend language config; falling back to default", err);
    }
    return "Node.js (TypeScript)";
}

/**
 * Returns the default lint command for the given language.
 * `cwd` lets JVM projects pick Maven or Gradle based on the generated manifest.
 */
export function getDefaultLintCommand(language: string, cwd?: string): string {
    if (language.includes("Go")) return "go fmt ./...";
    if (language.includes("Java")) {
        return cwd && fs.existsSync(path.join(cwd, "pom.xml")) ? "mvn -q -DskipTests verify" : "./gradlew check";
    }
    if (language.includes("Python")) return "ruff check .";
    if (language.includes(".NET")) return "dotnet format";
    if (language.includes("Rust")) return "cargo clippy";
    return "npm run lint";
}

/**
 * Returns the default test command for the given language.
 * `cwd` lets JVM projects pick Maven or Gradle based on the generated manifest.
 */
export function getDefaultTestCommand(language: string, cwd?: string): string {
    if (language.includes("Go")) return "go test ./...";
    if (language.includes("Java")) {
        return cwd && fs.existsSync(path.join(cwd, "pom.xml")) ? "mvn test" : "./gradlew test";
    }
    if (language.includes("Python")) return "pytest";
    if (language.includes(".NET")) return "dotnet test";
    return "npm test";
}
