import { describe, expect, it } from "vitest";
import { CORE_SKILLS } from "../src/modules/skills/definitions.js";

describe("Skills Definitions", () => {
    it("should define all core skills with proper keys", () => {
        const keys = Object.keys(CORE_SKILLS);
        expect(keys).toContain("FILE_SYSTEM");
        expect(keys).toContain("EDITING");
        expect(keys).toContain("ORCHESTRATION");
        expect(keys).toContain("GOVERNANCE");
        expect(keys).toContain("QUALITY_ASSURANCE");
        expect(keys).toContain("DATABASE_MANAGEMENT");
        expect(keys).toContain("DEVOPS_INFRASTRUCTURE");
    });

    it("should ensure all skills have valid properties, mandates and tools", () => {
        for (const [, skill] of Object.entries(CORE_SKILLS)) {
            expect(skill.name).toBeTypeOf("string");
            expect(skill.name.length).toBeGreaterThan(0);

            expect(skill.description).toBeTypeOf("string");
            expect(skill.description.length).toBeGreaterThan(0);

            expect(Array.isArray(skill.tools)).toBe(true);
            expect(skill.tools.length).toBeGreaterThan(0);
            for (const tool of skill.tools) {
                expect(tool).toBeTypeOf("string");
            }

            expect(Array.isArray(skill.mandates)).toBe(true);
            expect(skill.mandates.length).toBeGreaterThan(0);
            for (const mandate of skill.mandates) {
                expect(mandate).toBeTypeOf("string");
                expect(mandate.length).toBeGreaterThan(0);
            }
        }
    });
});
