import fs from "fs";
import path from "path";
import { ToolArgs, ToolResult } from "../types.js";
import { logger } from "../../../shared/logger.js";

interface LockedPackage {
    name: string;
    version: string;
    license: string;
}

/** Read a package's declared license from node_modules if available. */
function readInstalledLicense(projectRoot: string, name: string): string | undefined {
    try {
        const p = path.join(projectRoot, "node_modules", name, "package.json");
        if (!fs.existsSync(p)) return undefined;
        const json = JSON.parse(fs.readFileSync(p, "utf8")) as { license?: string | { type?: string }; licenses?: Array<{ type?: string }> };
        if (typeof json.license === "string") return json.license;
        if (json.license && typeof json.license === "object" && json.license.type) return json.license.type;
        if (Array.isArray(json.licenses) && json.licenses[0]?.type) return json.licenses[0].type;
    } catch (err) {
        logger.debug("Failed to read installed package license; treating as unknown", err);
    }
    return undefined;
}

/** Enumerate the FULL dependency tree from package-lock.json (npm v2/v3 + v1). */
function resolveLockPackages(projectRoot: string): LockedPackage[] {
    const lockPath = path.join(projectRoot, "package-lock.json");
    if (!fs.existsSync(lockPath)) return [];
    let lock: Record<string, unknown>;
    try {
        lock = JSON.parse(fs.readFileSync(lockPath, "utf8")) as Record<string, unknown>;
    } catch {
        return [];
    }

    const out: LockedPackage[] = [];
    const seen = new Set<string>();
    const push = (name: string, version: unknown, license: unknown) => {
        if (!name) return;
        const key = `${name}@${version}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({
            name,
            version: String(version || "?"),
            license: (typeof license === "string" && license) || readInstalledLicense(projectRoot, name) || "UNKNOWN",
        });
    };

    // npm v2/v3: { packages: { "node_modules/foo": { version, license } } }
    const packages = lock["packages"] as Record<string, { version?: unknown; license?: unknown }> | undefined;
    if (packages && typeof packages === "object") {
        for (const [key, entry] of Object.entries(packages)) {
            if (!key || key === "") continue;
            const idx = key.lastIndexOf("node_modules/");
            if (idx === -1) continue;
            push(key.slice(idx + "node_modules/".length), entry?.version, entry?.license);
        }
        return out;
    }

    // npm v1: nested { dependencies: { foo: { version, dependencies: {...} } } }
    const walk = (deps: Record<string, { version?: unknown; license?: unknown; dependencies?: unknown }> | undefined) => {
        if (!deps) return;
        for (const [name, entry] of Object.entries(deps)) {
            push(name, entry?.version, entry?.license);
            walk(entry?.dependencies as Record<string, { version?: unknown }> | undefined);
        }
    };
    walk(lock["dependencies"] as Record<string, { version?: unknown }> | undefined);
    return out;
}

function classifyLicense(license: string): "copyleft" | "weak-copyleft" | "permissive" | "unknown" {
    const l = license.toUpperCase();
    if (l === "UNKNOWN" || l === "") return "unknown";
    if (/\b(AGPL|SSPL|GPL-?[23]|GPL\b|CPAL|OSL|EUPL|CC-BY-SA)/.test(l)) return "copyleft";
    if (/LGPL|MPL|EPL|CDDL/.test(l)) return "weak-copyleft";
    if (/MIT|ISC|APACHE|BSD|UNLICENSE|CC0|0BSD|ARTISTIC|ZLIB|PYTHON/.test(l)) return "permissive";
    return "unknown";
}

/**
 * Audits package.json for redundant packages AND scans the full lockfile
 * dependency tree for copyleft / incompatible licenses.
 */
export function handleAuditDependencies(projectRoot: string, _args: ToolArgs): ToolResult {
    const pkgPath = path.join(projectRoot, "package.json");
    if (!fs.existsSync(pkgPath)) {
        throw new Error("package.json not found.");
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const depNames = Object.keys(deps);
    const results: string[] = [];

    // 1. Potential duplicate packages
    const similarityGroups: Record<string, string[]> = {
        "CSS/Styling": ["tailwind", "panda", "styled-components", "emotion", "sass"],
        "Testing": ["vitest", "jest", "mocha", "jasmine"],
        "Fetching": ["axios", "ky", "fetch"],
    };
    for (const [group, patterns] of Object.entries(similarityGroups)) {
        const found = depNames.filter((d) => patterns.some((p) => d.includes(p)));
        if (found.length > 1) results.push(`[WARN]  Potential redundancy in [${group}]: ${found.join(", ")}`);
    }

    const legacyDeps = depNames.filter((d) => d.includes("legacy") || d.includes("compat"));
    if (legacyDeps.length > 0) results.push(`[INFO]  Legacy compatibility packages: ${legacyDeps.join(", ")}`);

    // 2. Transitive license scan
    const locked = resolveLockPackages(projectRoot);
    if (locked.length > 0) {
        const copyleft: LockedPackage[] = [];
        const weak: LockedPackage[] = [];
        const unknown: LockedPackage[] = [];
        for (const p of locked) {
            const cls = classifyLicense(p.license);
            if (cls === "copyleft") copyleft.push(p);
            else if (cls === "weak-copyleft") weak.push(p);
            else if (cls === "unknown") unknown.push(p);
        }
        results.push(`[INFO]  Scanned ${locked.length} packages from package-lock.json (transitive included).`);
        if (copyleft.length > 0) {
            results.push(`[WARN]  Strong copyleft licenses in dependency tree (${copyleft.length}): ` +
                copyleft.slice(0, 20).map((p) => `${p.name}@${p.version} (${p.license})`).join(", ") +
                (copyleft.length > 20 ? ", …" : ""));
        }
        if (weak.length > 0) results.push(`[INFO]  Weak copyleft: ${weak.length} package(s) (e.g. ${weak[0].name} ${weak[0].license}).`);
        if (unknown.length > 0) results.push(`[INFO]  Unclassified/unknown license: ${unknown.length} package(s) — verify manually.`);
        if (copyleft.length === 0) results.push("[OK]  No strong-copyleft licenses detected in the dependency tree.");
    } else {
        results.push("[INFO]  No package-lock.json found — transitive license scan skipped (run 'npm install').");
    }

    return {
        content: [{
            type: "text",
            text: results.length > 0
                ? `Dependency Audit Results:\n\n${results.join("\n")}`
                : "[OK] Dependencies look clean and consolidated.",
        }],
    };
}
