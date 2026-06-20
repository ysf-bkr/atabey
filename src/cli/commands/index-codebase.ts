import fs from "fs";
import path from "path";
import { CoreMemory } from "../../modules/memory/core.js";
import { UI } from "../utils/ui.js";

/**
 * Iteratively reads all relevant codebase files and indexes them into Vector Memory.
 */
export async function indexCodebaseCommand(dirPath: string = process.cwd()) {
    UI.intent("Codebase RAG", `Indexing workspace at ${dirPath} into Vector Memory...`);

    const ignoreDirs = ["node_modules", "dist", ".git", ".atabey", "framework-mcp", "coverage"];
    const validExtensions = [".ts", ".js", ".tsx", ".jsx", ".md", ".json"];

    const filesToIndex: string[] = [];

    function traverse(currentPath: string) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
            if (ignoreDirs.includes(entry.name)) continue;

            const fullPath = path.join(currentPath, entry.name);
            if (entry.isDirectory()) {
                traverse(fullPath);
            } else if (entry.isFile() && validExtensions.includes(path.extname(entry.name))) {
                filesToIndex.push(fullPath);
            }
        }
    }

    try {
        traverse(dirPath);
        UI.success(`Found ${filesToIndex.length} files to index.`);
        
        await CoreMemory.init();

        let count = 0;
        for (const file of filesToIndex) {
            const relativePath = path.relative(process.cwd(), file);
            const content = fs.readFileSync(file, "utf8");

            // Skip huge files
            if (content.length > 50000) continue; 

            await CoreMemory.remember({
                content,
                category: "CODE_SNIPPET",
                filePath: relativePath,
                tags: ["codebase", path.extname(file).replace(".", "")]
            });
            count++;
        }

        UI.success(`Successfully indexed ${count} files into Core Memory (RAG).`);
    } catch (err) {
        UI.error(`Indexing failed: ${(err as Error).message}`);
    }
}
