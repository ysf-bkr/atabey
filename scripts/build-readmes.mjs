#!/usr/bin/env node
/**
 * Compose the per-package README files from shared fragments — a single source
 * of truth so `atabey`, `atabey-mcp` and `atabey-shared` stay consistent.
 *
 *   node scripts/build-readmes.mjs            # write packages README files
 *   node scripts/build-readmes.mjs --check    # verify only (exit 1 on drift)
 *
 * Templates live in `docs/readme/templates/` and pull shared blocks with
 *   &lt;!-- include: ../fragments/&lt;name&gt;.md --&gt;
 * The published package version is injected as `{{VERSION}}` (from the root
 * package.json), so badges never drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readmeDir = path.join(repoRoot, "docs", "readme");
const checkOnly = process.argv.includes("--check");

const INCLUDE_RE = /<!--\s*include:\s*([^\s>]+?)\s*-->/g;

function expandIncludes(text, baseDir, depth = 0) {
    if (depth > 8) throw new Error(`Include depth exceeded while resolving from ${baseDir}`);
    return text.replace(INCLUDE_RE, (_match, rel) => {
        const abs = path.resolve(baseDir, rel);
        if (!fs.existsSync(abs)) throw new Error(`Missing include: ${rel} (resolved: ${abs})`);
        const body = fs.readFileSync(abs, "utf8");
        return expandIncludes(body, path.dirname(abs), depth + 1).replace(/\s+$/, "") + "\n";
    });
}

const version = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;

const TARGETS = [
    { template: "templates/atabey.md", out: "packages/atabey/README.md" },
    { template: "templates/atabey-mcp.md", out: "packages/atabey-mcp/README.md" },
    { template: "templates/shared.md", out: "packages/shared/README.md" },
];

function render(templateRel) {
    const templatePath = path.join(readmeDir, templateRel);
    const raw = fs.readFileSync(templatePath, "utf8");
    const expanded = expandIncludes(raw, path.dirname(templatePath));
    return expanded.replace(/\{\{VERSION\}\}/g, version).replace(/\s+$/, "") + "\n";
}

let drift = 0;
for (const { template, out } of TARGETS) {
    const rendered = render(template);
    const outPath = path.join(repoRoot, out);
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;

    if (checkOnly) {
        if (current !== rendered) {
            console.error(`[readme] OUT OF DATE: ${out}`);
            drift++;
        }
    } else if (current !== rendered) {
        fs.writeFileSync(outPath, rendered, "utf8");
        console.log(`[readme] wrote ${out}`);
    } else {
        console.log(`[readme] unchanged ${out}`);
    }
}

if (checkOnly) {
    if (drift > 0) {
        console.error(`[readme] ${drift} file(s) out of date. Run: npm run readme:build`);
        process.exit(1);
    }
    console.log(`[readme] all ${TARGETS.length} package READMEs up to date (v${version})`);
}
