import fs from "fs";
import path from "path";
import { collectFiles } from "../utils/fs.js";
import { UI } from "../utils/ui.js";

const targetDir = process.cwd();

export async function explorerGraphCommand(targetPath: string) {
    UI.info(`Generating Dependency Graph for: ${targetPath}...`);
    const files = collectFiles(path.join(targetDir, targetPath), [".ts", ".tsx"]);
    const edges: string[] = [];
    files.forEach((f) => {
        const content = fs.readFileSync(f, "utf8");
        const name = path.basename(f, path.extname(f));
        const imports: string[] = content.match(/from\s+['"]\.\.?\/[^'"]+['"]/g) || [];
        imports.forEach((imp) => {
            const target = path.basename(imp.split(/['"]/)[1]);
            edges.push(`${name} --> ${target}`);
        });
    });
    if (edges.length === 0) {
        UI.info("No internal dependencies found.");
    } else {
        process.stdout.write("```mermaid\ngraph TD\n" + Array.from(new Set(edges)).join("\n") + "\n```\n");
    }
}

export async function explorerAuditCommand(targetPath: string) {
    UI.info(`Codebase Intelligence Scan: ${targetPath}...`);
    const files = collectFiles(path.join(targetDir, targetPath), [".ts", ".tsx"]);
    const complexity: string[] = [];
    files.forEach((f) => {
        const content = fs.readFileSync(f, "utf8");
        const lines = content.split("\n").length;
        if (lines > 300) complexity.push(`${path.relative(targetDir, f)} (${lines} lines)`);
    });
    if (complexity.length > 0) {
        process.stdout.write("\nComplexity Spikes:\n");
        complexity.forEach((c) => process.stdout.write(`- ${c}\n`));
    } else {
        UI.success("Codebase structure looks clean.");
    }
}
