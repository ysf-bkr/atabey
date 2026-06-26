import fs from "fs";
import path from "path";
import { writeJsonFile, writeTextFile } from "./fs.js";
import { UI } from "./ui.js";

export function getPackageVersion() {
    const root = getPackageRoot();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    return pkg.version;
}

export function getPackageManager() {
    const override = process.env.ATABEY_PACKAGE_MANAGER;
    if (override) return override.toLowerCase();

    const userAgent = process.env.npm_config_user_agent || "";
    const npmExecPath = process.env.npm_execpath || "";

    if (userAgent.includes("pnpm") || npmExecPath.includes("pnpm")) return "pnpm";
    if (userAgent.includes("yarn") || npmExecPath.includes("yarn")) return "yarn";

    // Check for lockfiles in target directory
    if (fs.existsSync(path.join(process.cwd(), "pnpm-lock.yaml")) || fs.existsSync(path.join(process.cwd(), "pnpm-workspace.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(process.cwd(), "yarn.lock"))) return "yarn";

    return "npm";
}

/**
 * Robustly locates the atabey package root from the currently executing module (src via tsx or bin).
 * Walks up from import.meta.url until it finds package.json with name === "atabey".
 * This ensures getValidatorPath() and getPackageVersion() work correctly both in source tree
 * AND when the package is consumed from node_modules after `npm install atabey` (global or local).
 * Critical for AL validation (validate-al-registry) and cross-adapter inits to work from npm.
 */
function findAgentAtabeyPackageRoot(): string {
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
    return findAgentAtabeyPackageRoot();
}

export function getValidatorPath(): string {
    return path.join(getPackageRoot(), "bin", "validate-al-registry.js");
}

export function getDependencyVersions() {
    const root = getPackageRoot();
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const devDependencies = pkg.devDependencies || {};
    const dependencies = pkg.dependencies || {};

    return {
        // ── Backend Core ──────────────────────────────────────────
        "fastify": dependencies["fastify"] || "^5.0.0",
        "@fastify/cors": dependencies["@fastify/cors"] || "^11.0.0",
        "@fastify/swagger": dependencies["@fastify/swagger"] || "^9.0.0",
        "@fastify/swagger-ui": dependencies["@fastify/swagger-ui"] || "^5.0.0",
        "@fastify/rate-limit": dependencies["@fastify/rate-limit"] || "^10.0.0",
        "@fastify/static": dependencies["@fastify/static"] || "^8.0.0",
        "zod": dependencies["zod"] || "^3.24.2",

        // ── Database / ORM ────────────────────────────────────────
        "kysely": dependencies["kysely"] || "^0.27.0",
        "typeorm": dependencies["typeorm"] || "^0.3.0",
        "reflect-metadata": dependencies["reflect-metadata"] || "^0.2.0",
        "pg": dependencies["pg"] || "^8.13.0",
        "better-sqlite3": dependencies["better-sqlite3"] || "^11.0.0",

        // ── Authentication ────────────────────────────────────────
        "bcrypt": dependencies["bcrypt"] || "^5.1.0",
        "@types/bcrypt": devDependencies["@types/bcrypt"] || "^5.0.0",
        "jsonwebtoken": dependencies["jsonwebtoken"] || "^9.0.0",
        "@types/jsonwebtoken": devDependencies["@types/jsonwebtoken"] || "^9.0.0",

        // ── Logging ───────────────────────────────────────────────
        "pino": dependencies["pino"] || "^9.0.0",
        "pino-pretty": devDependencies["pino-pretty"] || "^12.0.0",

        // ── Validation ────────────────────────────────────────────
        "@fastify/type-provider-typebox": dependencies["@fastify/type-provider-typebox"] || "^5.0.0",

        // Backend devDependencies
        "@types/node": devDependencies["@types/node"] || "^22.13.4",
        "tsx": devDependencies["tsx"] || "^4.19.4",
        "typescript": devDependencies["typescript"] || "^5.9.3",
        "vitest-backend": devDependencies["vitest"] || "^3.0.5",

        // ── Frontend Core ─────────────────────────────────────────
        "@vitejs/plugin-react": dependencies["@vitejs/plugin-react"] || "^5.0.0",
        "vite": dependencies["vite"] || "^7.0.0",
        "react": dependencies["react"] || "^19.0.0",
        "react-dom": dependencies["react-dom"] || "^19.0.0",
        "lucide-react": dependencies["lucide-react"] || "^0.468.0",
        "react-router-dom": dependencies["react-router-dom"] || "^7.0.0",
        "@tanstack/react-query": dependencies["@tanstack/react-query"] || "^5.0.0",

        // Frontend devDependencies
        "@types/react": devDependencies["@types/react"] || "^19.0.0",
        "@types/react-dom": devDependencies["@types/react-dom"] || "^19.0.0",
        "vitest-frontend": devDependencies["vitest"] || "^3.0.5",

        // ── Testing ───────────────────────────────────────────────
        "@playwright/test": devDependencies["@playwright/test"] || "^1.50.0",
    };
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
    let targetPkg: PackageJson = {};
    if (fs.existsSync(targetPath)) {
        try {
            targetPkg = JSON.parse(fs.readFileSync(targetPath, "utf8"));
        } catch {
            UI.warning("  Could not parse existing package.json, creating a new one.");
        }
    }

    const sourcePkg: PackageJson = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

  type PackageMap = Record<string, string>;
  const sanitizeDeps = (deps: PackageMap | Record<string, unknown> | undefined): Record<string, string> | undefined => {
      if (!deps) return deps as undefined;
      const cleaned: Record<string, string> = {};
      for (const [name, version] of Object.entries(deps)) {
          cleaned[name] = (typeof version === "string" && version.startsWith("workspace:")) ? "*" : String(version || "");
      }
      return cleaned;
  };

  const actualTargetScope = targetPkg.name && targetPkg.name.startsWith("@")
      ? targetPkg.name.split("/")[0]
      : (targetPkg.name ? `@${targetPkg.name}` : "");

  // Cleanup potential leftovers from previous bugged runs where atabey was renamed to target name
  if (actualTargetScope) {
      const scopeName = actualTargetScope.startsWith("@") ? actualTargetScope.slice(1) : actualTargetScope;
      const cleanup = (obj: Record<string, string> | undefined): void => {
          if (!obj) return;
          delete obj[scopeName];
          delete obj[actualTargetScope];
          delete obj["atabey"]; // Will be re-added correctly
      };
      cleanup(targetPkg.devDependencies);
      cleanup(targetPkg.dependencies);
  }

  targetPkg.dependencies = sanitizeDeps({
      ...targetPkg.dependencies,
      ...sourcePkg.dependencies
  });

  // Merge scripts
  const pkgMgr = getPackageManager();
  const runCmd = pkgMgr === "yarn" ? "yarn" : (pkgMgr === "pnpm" ? "pnpm" : "npm run");

  targetPkg.scripts = {
      ...targetPkg.scripts,
      "atabey:status": "atabey status",
      "atabey:trace": "atabey trace:new",
      "atabey:verify": "atabey verify-contract",
      "atabey:check": "atabey check",
      "atabey:test": "vitest run",
      "atabey:test:watch": "vitest",
      "atabey:build": `npm run build -w packages/atabey-mcp`,
  };

  const sourceDevDeps = sourcePkg.devDependencies || {};
  targetPkg.devDependencies = sanitizeDeps({
      ...targetPkg.devDependencies,
      "atabey": `^${sourcePkg.version}`,
      ...(sourceDevDeps["@modelcontextprotocol/sdk"] ? {"@modelcontextprotocol/sdk": sourceDevDeps["@modelcontextprotocol/sdk"]} : {}),
      ...(sourceDevDeps["zod"] ? {"zod": sourceDevDeps["zod"]} : {}),
      ...(sourceDevDeps["ts-morph"] ? {"ts-morph": sourceDevDeps["ts-morph"]} : {}),
      ...(sourceDevDeps["typescript"] ? {"typescript": sourceDevDeps["typescript"]} : {}),
      ...(sourceDevDeps["@types/node"] ? {"@types/node": sourceDevDeps["@types/node"]} : {}),
      ...(sourceDevDeps["tsx"] ? {"tsx": sourceDevDeps["tsx"]} : {}),
      ...(sourceDevDeps["vitest"] ? {"vitest": sourceDevDeps["vitest"]} : {})
  });

  if (targetPkg.peerDependencies) {
      targetPkg.peerDependencies = sanitizeDeps(targetPkg.peerDependencies);
  }
  if (targetPkg.optionalDependencies) {
      targetPkg.optionalDependencies = sanitizeDeps(targetPkg.optionalDependencies);
  }

  // Ensure basic fields
  if (!targetPkg.name) targetPkg.name = path.basename(process.cwd());
  if (!targetPkg.version) targetPkg.version = "0.0.12";
  if (!targetPkg.type) targetPkg.type = "module";
  // DO NOT add framework-mcp to workspaces in consumer projects
  // if (!targetPkg.workspaces) targetPkg.workspaces = ["framework-mcp"];

  // Add metadata
  targetPkg.atabey = {
      version: sourcePkg.version || "0.0.0",
      initializedAt: new Date().toISOString(),
  };

  writeJsonFile(targetPath, targetPkg);
  UI.success(" package.json updated with Atabey scripts and dependencies.");
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
