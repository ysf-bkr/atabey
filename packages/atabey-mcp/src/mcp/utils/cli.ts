import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

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
 * Detects the backend language from the framework configuration.
 */
export function getBackendLanguage(projectRoot: string): string {
    try {
        const configPath = path.join(projectRoot, ".atabey", "config.json");
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
            return config.backendLanguage || "Node.js (TypeScript)";
        }
    } catch {
        // Fallback to default
    }
    return "Node.js (TypeScript)";
}

/**
 * Returns the default lint command for the given language.
 */
export function getDefaultLintCommand(language: string): string {
    if (language.includes("Go")) return "go fmt ./...";
    if (language.includes("Java")) return "./gradlew check"; // or mvn check
    if (language.includes("Python")) return "ruff check .";
    if (language.includes(".NET")) return "dotnet format";
    return "npm run lint";
}

/**
 * Returns the default test command for the given language.
 */
export function getDefaultTestCommand(language: string): string {
    if (language.includes("Go")) return "go test ./...";
    if (language.includes("Java")) return "./gradlew test"; // or mvn test
    if (language.includes("Python")) return "pytest";
    if (language.includes(".NET")) return "dotnet test";
    return "npm test";
}
