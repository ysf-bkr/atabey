import { describe, expect, it } from "vitest";
import { parseSpecToTasks } from "../../../src/cli/commands/spec.js";

describe("Specification Engine (parseSpecToTasks)", () => {
    it("should parse execution dependency graph from a markdown spec", () => {
        const sampleSpec = `
# [SPEC-001] User Authentication Service

## 1. Executive Summary
Authentication service.

## 2. User Stories & Acceptance Criteria
- **Story 1:** Given credentials When login requested Then return JWT token.

## 6. Execution Dependency Graph
1. \`TASK_01\`: Database schema migration & Kysely models (@database)
   - Criteria: Given fresh database When migration runs Then users table exists.
2. \`TASK_02\`: Authentication domain service implementation (@backend) [Depends on: TASK_01]
   - Criteria: Given valid credentials When login is called Then sign JWT token.
3. \`TASK_03\`: Dual-axis quality audit & security check (@quality) [Depends on: TASK_02]
   - Criteria: All tests pass with zero any and zero console.log.
`;

        const tasks = parseSpecToTasks(sampleSpec);

        expect(tasks).toHaveLength(3);

        expect(tasks[0].id).toBe("TASK_01");
        expect(tasks[0].agent).toBe("database");
        expect(tasks[0].dependencies).toEqual([]);
        expect(tasks[0].acceptanceCriteria).toHaveLength(1);
        expect(tasks[0].acceptanceCriteria![0]).toContain("Given fresh database");

        expect(tasks[1].id).toBe("TASK_02");
        expect(tasks[1].agent).toBe("backend");
        expect(tasks[1].dependencies).toEqual(["TASK_01"]);

        expect(tasks[2].id).toBe("TASK_03");
        expect(tasks[2].agent).toBe("quality");
        expect(tasks[2].dependencies).toEqual(["TASK_02"]);
    });

    it("should return empty array when no dependency graph section is present", () => {
        const emptySpec = `# Title\n\nNo tasks here.`;
        const tasks = parseSpecToTasks(emptySpec);
        expect(tasks).toHaveLength(0);
    });
});
