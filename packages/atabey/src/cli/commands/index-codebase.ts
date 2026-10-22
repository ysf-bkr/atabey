import fs from "fs";
import path from "path";
import { CoreMemory } from "../../modules/memory/core.js";
import { UI } from "../utils/ui.js";

/** Directories never indexed in any project. */
const BASE_IGNORE_DIRS = ["node_modules", "dist", ".git", ".atabey", "coverage", "build", "out", ".next", ".turbo"];

/** Additional directories skipped only inside the Atabey framework monorepo
 *  (its own packages/* is framework source, not consumer application code). */
const FRAMEWORK_REPO_EXTRA_IGNORE_DIRS = ["packages"];

/** Max file size for the RAG content index (larger files are skipped). */
const MAX_FILE_CHARS = 50_000;

const VALID_EXTENSIONS = [".ts", ".js", ".tsx", ".jsx", ".md", ".json"];

/** True when the target is the Atabey framework monorepo itself. */
function isFrameworkRepo(projectRoot: string): boolean {
    try {
        const pkgPath = path.join(projectRoot, "package.json");
        if (!fs.existsSync(pkgPath)) return false;
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { frameworkRepo?: boolean; atabey?: { frameworkRepo?: boolean } };
        return Boolean(pkg.frameworkRepo || pkg.atabey?.frameworkRepo);
    } catch {
        return false;
    }
}

export interface CodebaseIndexResult {
    /** Files written into the RAG content index (CoreMemory). */
    filesIndexed: number;
    /** Files discovered for indexing. */
    filesFound: number;
    /** Symbol-graph stats (zeros when the graph step is unavailable). */
    graphFiles: number;
    graphSymbols: number;
    graphImports: number;
}

/**
 * Indexes the workspace into Vector Memory (RAG content index) and the
 * incremental symbol/import graph. Shared by `atabey index` and the automatic
 * post-init indexing pass.
 */
export async function indexCodebase(dirPath: string = process.cwd()): Promise<CodebaseIndexResult> {
    const ignoreDirs = new Set(BASE_IGNORE_DIRS);
    if (isFrameworkRepo(dirPath)) {
        for (const d of FRAMEWORK_REPO_EXTRA_IGNORE_DIRS) ignoreDirs.add(d);
    }

    const filesToIndex: string[] = [];

    function traverse(currentPath: string) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            if (ignoreDirs.has(entry.name)) continue;

            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.isFile() && VALID_EXTENSIONS.includes(path.extname(entry.name))) {
                filesToIndex.push(fullPath);
            }
        }
    }

    // Also explicitly include .atabey/knowledge standards
    const knowledgeDir = path.join(dirPath, ".atabey", "knowledge");
    if (fs.existsSync(knowledgeDir)) {
        const kFiles = fs.readdirSync(knowledgeDir);
        for (const kf of kFiles) {
            if (kf.endsWith(".md")) {
                filesToIndex.push(path.join(knowledgeDir, kf));
            }
        }
    }

    traverse(dirPath);

    await CoreMemory.init();

    let count = 0;
    for (const file of filesToIndex) {
        const relativePath = path.relative(process.cwd(), file);
        const content = fs.readFileSync(file, "utf8");

        // Skip huge files
        if (content.length > MAX_FILE_CHARS) continue;

        const isRule = file.includes(".atabey/knowledge");
        await CoreMemory.remember({
            content,
            category: isRule ? "RULE" : "CODE_SNIPPET",
            filePath: relativePath,
            tags: isRule ? ["knowledge", "standard"] : ["codebase", path.extname(file).replace(".", "")]
        });
        count++;
    }

    // Incremental symbol/file/import graph (CodeGraph) — the substrate for
    // "assemble context without re-scanning the whole codebase".
    let graphFiles = 0;
    let graphSymbols = 0;
    let graphImports = 0;
    try {
        const { CodeGraph } = await import("../../modules/memory/code-graph.js");
        const g = CodeGraph.index(dirPath);
        graphFiles = g.files;
        graphSymbols = g.symbols;
        graphImports = g.imports;
    } catch (err) {
        UI.warning(`Code graph indexing skipped: ${(err as Error).message}`);
    }

    return { filesIndexed: count, filesFound: filesToIndex.length, graphFiles, graphSymbols, graphImports };
}

/**
 * CLI entrypoint: `atabey index [dir]`.
 */
export async function indexCodebaseCommand(dirPath: string = process.cwd()) {
    UI.intent("Codebase RAG", `Indexing workspace at ${dirPath} into Vector Memory...`);

    try {
        const result = await indexCodebase(dirPath);

        UI.success(`Found ${result.filesFound} files to index.`);
        UI.success(`Successfully indexed ${result.filesIndexed} files into Core Memory (RAG).`);
        UI.success(
            `Symbol graph: ${result.graphFiles} files, ${result.graphSymbols} symbols, ${result.graphImports} imports.`,
        );
    } catch (err) {
        UI.error(`Indexing failed: ${(err as Error).message}`);
    }
}
