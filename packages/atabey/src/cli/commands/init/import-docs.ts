import fs from "fs";
import path from "path";
import readline from "readline";

import { writeTextFile } from "../../utils/fs.js";
import { UI } from "../../utils/ui.js";

/** Root-level markdown files Atabey itself manages — never imported, never deleted. */
const ATABEY_MANAGED_DOCS = new Set([
    "AGENTS.md",
    "ATABEY.md",
    "CLAUDE.md",
    "CURSOR.md",
    "GROK.md",
    "LOCAL_AI.md",
    "OPENCODE.md",
    "copilot-instructions.md",
    "PROJECT_MEMORY.md",
    "README.md", // README stays: it describes the repo for humans; not agent context.
]);

export interface ImportDocsOptions {
    /** Ask the user per file (interactive mode). */
    interactive: boolean;
    /** Non-interactive: import every candidate without asking. */
    autoImport: boolean;
    /** Core framework dir (`.atabey`) that receives the imported knowledge. */
    coreDir: string;
    dryRun?: boolean;
}

/** Root-level project docs (README-like context files) eligible for import. */
export function findImportableRootDocs(projectRoot: string): string[] {
    if (!fs.existsSync(projectRoot)) return [];
    return fs
        .readdirSync(projectRoot, { withFileTypes: true })
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md") && !ATABEY_MANAGED_DOCS.has(e.name))
        .map((e) => e.name)
        .sort();
}

function importDoc(projectRoot: string, coreDir: string, fileName: string, dryRun: boolean): void {
    const src = path.join(projectRoot, fileName);
    const destDir = path.join(projectRoot, coreDir, "knowledge", "imported");
    const dest = path.join(destDir, fileName);

    if (dryRun) {
        UI.success(`[DRY-RUN] Would import ${fileName} → ${coreDir}/knowledge/imported/${fileName} and remove the root copy.`);
        return;
    }

    fs.mkdirSync(destDir, { recursive: true });
    const body = fs.readFileSync(src, "utf8");
    const header = `> Imported from project root \`${fileName}\` on ${new Date().toISOString()} by \`atabey init\`.\n> The original file was removed from the root — Atabey knowledge base is the single source of truth.\n\n`;
    writeTextFile(dest, header + body);

    fs.rmSync(src, { force: true });
    UI.success(`Imported ${fileName} → ${coreDir}/knowledge/imported/${fileName} (root copy removed)`);
}

/**
 * Import root-level project markdown docs into the Atabey knowledge base so all
 * project context lives under Atabey's control. The user is asked per file in
 * interactive mode; with `--yes` docs are only imported when `--import-docs` is
 * passed explicitly.
 */
export async function importRootDocs(projectRoot: string, opts: ImportDocsOptions): Promise<void> {
    const candidates = findImportableRootDocs(projectRoot);

    if (candidates.length === 0) {
        UI.success("No unmanaged root-level docs found — knowledge base already authoritative.");
        return;
    }

    if (!opts.interactive && !opts.autoImport) {
        UI.warning(
            `Found ${candidates.length} root-level project doc(s): ${candidates.join(", ")}.`
        );
        UI.warning(
            "Run 'atabey init <ai> --import-docs' to move them into .atabey/knowledge/imported/ and keep everything under Atabey control."
        );
        return;
    }

    if (!opts.interactive) {
        for (const file of candidates) importDoc(projectRoot, opts.coreDir, file, opts.dryRun ?? false);
        return;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (query: string): Promise<string> => new Promise((resolve) => rl.question(query, resolve));

    try {
        process.stdout.write("\n[DOC IMPORT] Root-level project docs detected:\n");
        candidates.forEach((f, i) => process.stdout.write(`  ${i + 1}. ${f}\n`));
        process.stdout.write(
            "Importing moves each file into .atabey/knowledge/imported/ and removes the root copy,\n" +
            "so agents read project context from the Atabey knowledge base only.\n\n"
        );

        for (const file of candidates) {
            const answer = (await question(`Import '${file}' into Atabey knowledge and remove it from the root? [y/N] `)).trim().toLowerCase();
            if (answer === "y" || answer === "yes") {
                importDoc(projectRoot, opts.coreDir, file, opts.dryRun ?? false);
            } else {
                UI.success(`Kept '${file}' at the project root (not imported).`);
            }
        }
    } finally {
        rl.close();
    }
}
