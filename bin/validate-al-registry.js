#!/usr/bin/env node

import fs from "fs";
import yaml from "js-yaml";
import path from "path";

/**
 * AL-compatible agent folder names across all adapters (after init).
 */
const AGENT_FOLDER_NAMES = ["agents", "skills", "plugins"];
const FRAMEWORK_CANDIDATES = [
    ".atabey",
    ".cursor",
    ".claude",
    ".github",
    ".grok",
    ".antigravity",
    ".agent",
    ".gemini/antigravity-cli",
    ".gemini",
    ".agents",
    "antigravity-cli"
];

function detectFrameworkDir() {
    const projectRoot = process.cwd();
    for (const dir of FRAMEWORK_CANDIDATES) {
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

/**
 * Helper to parse YAML-like Frontmatter from Markdown.
 */
function parseFrontmatter(content) {
    let fm = {};
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (match) {
        try {
            fm = yaml.load(match[1]) || {};
        } catch (e) {
            process.stderr.write(`[ERROR] Error parsing YAML frontmatter: ${e}\n`);
        }
    }

    // Also parse from HTML comments in the body as fallback/complement
    const commentMatches = content.matchAll(/<!--\s*(\w+)\s*:\s*(.*?)\s*-->/g);
    for (const m of commentMatches) {
        let value = m[2].trim();
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value.slice(1, -1).split(",").map(s => s.trim().replace(/"/g, "").replace(/'/g, ""));
        } else if (value.startsWith("\"") && value.endsWith("\"")) {
            value = value.slice(1, -1);
        }
        fm[m[1]] = value;
    }

    return Object.keys(fm).length > 0 ? fm : null;
}


const detected = detectFrameworkDir();
if (!detected) {
    process.stderr.write("ℹ️  No framework agents/ dir found for AL validation. Skipping.");
    process.exit(0);
}

const { agentsDir } = detected;

try {
    const files = [];
    const walk = (dir) => {
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

    process.stderr.write(`\n[SECURITY]  STARTING AL REGISTRY VALIDATION (${detected.frameworkDir})...\n`);
    process.stderr.write("--------------------------------------------------\n");
    process.stderr.write("| Agent ID  | Format | Status    | Category       |\n");
    process.stderr.write("--------------------------------------------------\n");

    for (const file of files) {
        const fileName = file.name;
        const filePath = file.path;
        if (fileName === "agent_AL_schema.json" || fileName === "schema") continue;

        const content = fs.readFileSync(filePath, "utf8");
        const isMd = fileName.endsWith(".md");

        let agent;
        try {
            agent = isMd ? parseFrontmatter(content) : JSON.parse(content);
            if (!agent && isMd) throw new Error("Missing Frontmatter");
        } catch (e) {
            process.stderr.write(`| ${fileName.padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [ERROR] INVALID | ${String(e.message).slice(0, 14)} |\n`);
            totalFailed++;
            continue;
        }

        // Validate AL compliance fields
        const missing = [];
        if (!agent.name) missing.push("name");
        if (agent.capability === undefined) missing.push("capability");
        if (!agent.tags) missing.push("tags");

        if (missing.length > 0) {
            process.stderr.write(`| ${fileName.padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [ERROR] FAILED  | ${missing.join(",").slice(0, 14)} |\n`);
            totalFailed++;
        } else {
            const cat = Array.isArray(agent.tags) ? agent.tags[0] : "core";
            process.stderr.write(`| ${agent.name.padEnd(9)} | ${isMd ? "MD  " : "JSON"} | [OK] PASSED  | ${cat.padEnd(14)} |\n`);
        }
    }

    process.stderr.write("--------------------------------------------------\n");
    if (totalFailed > 0) {
        process.stderr.write(`[ERROR] Validation failed! Detected ${totalFailed} invalid agent configurations.\n`);
        process.exit(1);
    } else {
        process.stderr.write("🎉 SUCCESS: All core agents are AL-Compliant!\n");
    }
} catch (e) {
    process.stderr.write(`[ERROR] Critical error during validation: ${e}\n`);
    process.exit(1);
}
