import fs from "fs";
import path from "path";
import { writeJsonFile, writeTextFile } from "./fs.js";
import { UI } from "./ui.js";

export function getPackageVersion() {
    const root = getPackageRoot();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return pkg.version;
}

/**
 * Robustly locates the atabey package root from the currently executing module (src via tsx or bin).
 * Walks up from import.meta.url until it finds package.json with name === "atabey".
 * This ensures getValidatorPath() and getPackageVersion() work correctly both in source tree
 * AND when the package is consumed from node_modules after `npm install atabey` (global or local).
 * Critical for AL validation (validate-al-registry) and cross-adapter inits to work from npm.
 */
function findAtabeyPackageRoot(): string {
    let current = path.dirname(new URL(import.meta.url).pathname);
    const root = path.parse(current).root;
    while (current !== root) {
        if (path.basename(current) === "dist") {
            current = path.dirname(current);
            continue;
        }
        const pkgPath = path.join(current, "package.json");
        if (fs.existsSync(pkgPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
                if (pkg.name === "atabey") {
                    return current;
                }
            } catch {
                // ignore parse errors on intermediate package.jsons (e.g. user's project), continue
            }
        }
        current = path.dirname(current);
    }
    // Fallback maintains prior behavior for unusual layouts
    const __filenameLocal = new URL(import.meta.url).pathname;
    const __dirnameLocal = path.dirname(__filenameLocal);
    return path.join(__dirnameLocal, "../../..");
}

export function getPackageRoot(): string {
    return findAtabeyPackageRoot();
}

interface PackageJson {
    name?: string;
    version?: string;
    type?: string;
    workspaces?: string[];
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
    atabey?: Record<string, unknown>;
  }

export function mergePackageJson(targetPath: string, sourcePath: string): void {
    let targetPkg: PackageJson & { frameworkRepo?: boolean } = {};
    const exists = fs.existsSync(targetPath);
    if (exists) {
        try {
            targetPkg = JSON.parse(fs.readFileSync(targetPath, "utf8"));
        } catch {
            UI.warning("  Could not parse existing package.json, creating a new one.");
        }
    }

    if (targetPkg.frameworkRepo === true || targetPkg.atabey?.frameworkRepo === true) {
        return;
    }

    const sourcePkg: PackageJson = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

    // If it's a completely NEW package.json (did not exist before):
    if (!exists) {
        targetPkg.name = path.basename(process.cwd());
        targetPkg.version = "0.1.0";
        targetPkg.type = "module";
    }

    // Merge scripts - prefix with atabey: to never overwrite user scripts
    targetPkg.scripts = {
        ...targetPkg.scripts,
        "atabey:status": "atabey status",
        "atabey:trace": "atabey trace new",
        "atabey:verify": "atabey contract",
        "atabey:check": "atabey check",
    };

    // Add atabey and atabey-mcp to devDependencies only
    targetPkg.devDependencies = {
        ...targetPkg.devDependencies,
        "atabey": `^${sourcePkg.version}`,
        "atabey-mcp": `^${sourcePkg.version}`,
    };

    // Add metadata
    targetPkg.atabey = {
        version: sourcePkg.version || "0.1.5",
        initializedAt: new Date().toISOString(),
    };

    writeJsonFile(targetPath, targetPkg);
    UI.success("  package.json preserved and integrated with Atabey.");
}

export function sanitizeJson(obj: unknown, targetScope = ""): unknown {
    if (typeof obj !== "object" || obj === null) return obj;
    if (Array.isArray(obj)) return obj.map(item => sanitizeJson(item, targetScope));
    const cleaned: Record<string, unknown> = {};
    const record = obj as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
        let finalKey = key;
        let finalValue = value;

        // Remove UnoCSS related keys or values
        if (typeof key === "string" && key.includes("unocss")) continue;
        if (typeof value === "string" && value.includes("unocss")) {
            continue; // Skip this script/field
        }

        // Replace scope if needed
        if (targetScope) {
            const scopeName = targetScope.startsWith("@") ? targetScope.slice(1) : targetScope;

            // Handle scoped: @atabey/foo -> @target/foo
            if (typeof key === "string" && key.startsWith("@atabey/")) {
                finalKey = key.replace("@atabey/", `${targetScope}/`);
            }
            if (typeof value === "string" && value.startsWith("@atabey/")) {
                finalValue = value.replace("@atabey/", `${targetScope}/`);
            }

            // Handle unscoped: atabey-foo -> target-foo
            if (typeof key === "string" && key.startsWith("atabey-")) {
                finalKey = key.replace("atabey-", `${scopeName}-`);
            }
            if (typeof value === "string" && value.startsWith("atabey-")) {
                finalValue = value.replace("atabey-", `${scopeName}-`);
            }

            // Handle atabey -> target (ONLY for the package name)
            if (key === "name" && value === "atabey") {
                finalValue = scopeName;
            }

            // Preserve atabey in dependencies and bin
            // (No action needed as finalKey/finalValue default to original)

            if (typeof value === "string" && value.startsWith("workspace:")) {
                finalValue = "*";
            }
        } else if (typeof value === "string" && value.startsWith("workspace:")) {
            finalValue = "*";
        }

        cleaned[finalKey] = (typeof finalValue === "object" && finalValue !== null) ? sanitizeJson(finalValue, targetScope) : finalValue;
    }
    return cleaned;
}

export function deepCleanProtocols(dir: string, targetScope = ""): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            deepCleanProtocols(fullPath, targetScope);
        } else if (entry.name === "package.json") {
            try {
                const content = fs.readFileSync(fullPath, "utf8");
                const json = JSON.parse(content);
                const cleaned = JSON.stringify(sanitizeJson(json, targetScope), null, 2);
                writeTextFile(fullPath, cleaned);
            } catch {
                // ignore malformed json
            }
        } else if (entry.name === "package-lock.json") {
            fs.unlinkSync(fullPath);
        }
    }
}
