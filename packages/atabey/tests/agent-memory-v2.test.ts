import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { toClaudeCodeMd, toGeminiCliMd, toAntigravityJson } from "../src/modules/agents/definitions.js";

describe("Agent Memory V2 (Learned Conventions)", () => {
    let tempDir: string;
    let specialtiesDir: string;
    let oldTestDir: string | undefined;

    const mockAgent = {
        name: "backend",
        displayName: "Backend Specialist",
        role: "Backend logic",
        description: "Handles backend tasks",
        capability: 9,
        tier: "core",
        tags: ["core"],
        stateMachine: "../schema/life.json",
        tools: ["read_file"],
        instructions: {
            identity: "Mock Identity",
            mission: "Mock mission",
            rules: ["Strict rules"],
            knowledgeFiles: []
        }
    };

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-memory-v2-test-"));
        specialtiesDir = path.join(tempDir, "memory", "specialties");
        fs.mkdirSync(specialtiesDir, { recursive: true });
        
        oldTestDir = process.env.ATABEY_TEST_DIR;
        process.env.ATABEY_TEST_DIR = tempDir;
    });

    afterEach(() => {
        if (oldTestDir !== undefined) {
            process.env.ATABEY_TEST_DIR = oldTestDir;
        } else {
            delete process.env.ATABEY_TEST_DIR;
        }
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("should append learned conventions to markdown shims and JSON specs if specialty file exists", () => {
        // Write mock specialty memory
        const learnedRule = "Convention: Always use Kysely query builder, never write raw SQL.";
        fs.writeFileSync(path.join(specialtiesDir, "backend.md"), learnedRule);

        // 1. Verify Claude Code markdown
        const claudeMd = toClaudeCodeMd(mockAgent as any);
        expect(claudeMd).toContain("Learned Conventions (Project-Specific Experience)");
        expect(claudeMd).toContain(learnedRule);

        // 2. Verify Gemini CLI markdown
        const geminiMd = toGeminiCliMd(mockAgent as any);
        expect(geminiMd).toContain("Learned Conventions (Project-Specific Experience)");
        expect(geminiMd).toContain(learnedRule);

        // 3. Verify Antigravity JSON Spec
        const antigravityJson = toAntigravityJson(mockAgent as any);
        const parsed = JSON.parse(antigravityJson);
        const systemPromptSections = parsed.customAgentSpec.customAgent.systemPromptSections;
        
        const learnedSection = systemPromptSections.find((s: any) => s.title.includes("Learned Conventions"));
        expect(learnedSection).toBeDefined();
        expect(learnedSection.content).toBe(learnedRule);
    });

    it("should NOT append learned conventions if specialty file does not exist", () => {
        const claudeMd = toClaudeCodeMd(mockAgent as any);
        expect(claudeMd).not.toContain("Learned Conventions");
    });
});
