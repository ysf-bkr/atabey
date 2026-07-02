import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { FRAMEWORK_DIR_CANDIDATES } from "atabey-shared";

const AGENT_FOLDER_NAMES = ["agents", "skills", "plugins"] as const;

interface DetectResult {
    frameworkDir: string;
    agentsDir: string;
}

function detectFrameworkDir(projectRoot: string): DetectResult | null {
    for (const dir of FRAMEWORK_DIR_CANDIDATES) {
        const dirPath = path.resolve(projectRoot, dir);
        if (!fs.existsSync(dirPath)) continue;

        for (const folderName of AGENT_FOLDER_NAMES) {
            const agentsPath = path.join(dirPath, folderName);
            if (fs.existsSync(agentsPath)) {
                return { frameworkDir: dir, agentsDir: agentsPath };
            }
        }
    }
    return null;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
    let fm: Record<string, unknown> = {};
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
        try {
            fm = (yaml.load(match[1]) || {}) as Record<string, unknown>;
        } catch (e) {
            throw new Error(`Error parsing YAML frontmatter: ${(e as Error).message}`);
        }
    }

    // Also parse from HTML comments in the body as fallback/complement
    const commentMatches = content.matchAll(/<!--\s*(\w+)\s*:\s*(.*?)\s*-->/g);
    for (const m of commentMatches) {
        let value: string | string[] = m[2].trim();
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value.slice(1, -1).split(",").map(s => s.trim().replace(/"/g, "").replace(/'/g, ""));
        } else if (value.startsWith("\"") && value.endsWith("\"")) {
            value = value.slice(1, -1);
        }
        fm[m[1]] = value;
    }

    return Object.keys(fm).length > 0 ? fm : null;
}

export function validateAlRegistry(projectRoot: string = process.cwd()): { success: boolean; output: string } {
    const detected = detectFrameworkDir(projectRoot);
    if (!detected) {
        return { success: true, output: "No framework agents directory found for AL validation. Skipping." };
    }

    const { agentsDir, frameworkDir } = detected;
    let output = `\n[SECURITY] STARTING AL REGISTRY VALIDATION (${frameworkDir})...\n`;
    output += "--------------------------------------------------\n";
    output += "| Agent ID  | Format | Status    | Category       |\n";
    output += "--------------------------------------------------\n";

    const files: { name: string; path: string }[] = [];
    const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        const list = fs.readdirSync(dir);
        for (const item of list) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                walk(fullPath);
            } else if (item.endsWith(".json") || item.endsWith(".md")) {
                files.push({ name: item, path: fullPath });
            }
        }
    };
    walk(agentsDir);

    let totalFailed = 0;

    for (const file of files) {
        const fileName = file.name;
        const filePath = file.path;
        if (fileName === "agent_AL_schema.json" || fileName === "schema") continue;

        let content: string;
        try {
            content = fs.readFileSync(filePath, "utf8");
        } catch (e) {
            output += `| ${fileName.slice(0, 9).padEnd(9)} | Error  | [ERROR] READ FAILED | ${(e as Error).message.slice(0, 14)} |\n`;
            totalFailed++;
            continue;
        }

        const isMd = fileName.endsWith(".md");
        let agent: Record<string, unknown> | null = null;

        try {
            agent = isMd ? parseFrontmatter(content) : JSON.parse(content);
            if (!agent && isMd) throw new Error("Missing Frontmatter");
        } catch (e) {
            output += `| ${fileName.slice(0, 9).padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [ERROR] INVALID | ${(e as Error).message.slice(0, 14)} |\n`;
            totalFailed++;
            continue;
        }

        if (!agent) {
            output += `| ${fileName.slice(0, 9).padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [ERROR] EMPTY   | - |\n`;
            totalFailed++;
            continue;
        }

        // Validate AL compliance fields
        const missing: string[] = [];
        if (!agent.name) missing.push("name");
        if (agent.capability === undefined) missing.push("capability");
        if (!agent.tags) missing.push("tags");

        if (missing.length > 0) {
            output += `| ${fileName.slice(0, 9).padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [ERROR] FAILED  | ${missing.join(",").slice(0, 14)} |\n`;
            totalFailed++;
        } else {
            const agentName = String(agent.name);
            const cat = Array.isArray(agent.tags) ? String(agent.tags[0]) : "core";
            output += `| ${agentName.slice(0, 9).padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [OK] PASSED  | ${cat.slice(0, 14).padEnd(14)} |\n`;
        }
    }

    output += "--------------------------------------------------\n";
    if (totalFailed > 0) {
        output += `[ERROR] Validation failed! Detected ${totalFailed} invalid agent configurations.\n`;
        return { success: false, output };
    }

    output += "🎉 SUCCESS: All core agents are AL-Compliant!\n";
    return { success: true, output };
}
