#!/usr/bin/env node
/**
 * Framework monorepo postinstall: ensure .atabey/ exists after clone.
 * Consumer projects are unaffected (atabey.frameworkRepo !== true).
 */
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

const root = process.cwd();
const pkgPath = join(root, "package.json");

if (!existsSync(pkgPath)) process.exit(0);

let pkg;
try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
} catch {
    process.exit(0);
}

if (!pkg.atabey?.frameworkRepo) process.exit(0);

const configPath = join(root, ".atabey", "config.json");
if (existsSync(configPath)) process.exit(0);

try {
    console.log("[atabey] Framework repo detected — running atabey:setup...");
    execSync("npm run atabey:setup", { stdio: "inherit", cwd: root });
} catch {
    console.warn("[atabey] atabey:setup skipped (run manually: npm run atabey:setup)");
}