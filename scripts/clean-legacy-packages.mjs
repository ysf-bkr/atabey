import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const rootPkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
const currentVersion = rootPkg.version;
const packages = ["atabey-shared", "atabey-mcp", "atabey"];

console.log(`\n======================================================`);
console.log(` Atabey NPM Legacy Package Cleaner`);
console.log(` Current active version: ${currentVersion}`);
console.log(` Target packages: ${packages.join(", ")}`);
console.log(`======================================================\n`);

console.log(`Deprecating all legacy versions older than ${currentVersion} on NPM...`);
for (const pkg of packages) {
  try {
    console.log(`\n-> Deprecating ${pkg}@"<${currentVersion}"...`);
    execSync(`npm deprecate -f "${pkg}@<${currentVersion}" "Deprecated. Please upgrade to ${currentVersion}"`, {
      stdio: "inherit",
    });
    console.log(`✓ ${pkg} legacy versions (<${currentVersion}) marked as deprecated.`);
  } catch (err) {
    console.error(`✗ Failed to deprecate ${pkg}:`, err.message);
  }
}

console.log(`\nDone! All versions prior to ${currentVersion} have been deprecated.`);
