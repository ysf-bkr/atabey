import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import * as memoryUtils from "../src/cli/utils/memory.js";
import { planCommand } from "../src/cli/commands/plan.js";
import { Storage } from "../src/shared/storage.js";

describe("Plan Command Dynamic Task Planner", () => {
    let tempDir: string;
    let docsDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-plan-test-"));
        docsDir = path.join(tempDir, "docs");
        fs.mkdirSync(docsDir, { recursive: true });
        
        process.env.ATABEY_TEST_DIR = tempDir;
        
        // Mock path resolution and cwd
        vi.spyOn(memoryUtils, "getFrameworkDir").mockReturnValue(tempDir);
        vi.spyOn(memoryUtils, "getDocumentStorePath").mockReturnValue(path.join(tempDir, "memory"));
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);

        memoryUtils.initDocumentStore(tempDir);
    });

    afterEach(() => {
        delete process.env.ATABEY_TEST_DIR;
        fs.rmSync(tempDir, { recursive: true, force: true });
        vi.restoreAllMocks();
        Storage.reset();
    });

    it("should parse markdown checklist and create sequential task chain with dependencies", async () => {
        // Create a mock requirements doc
        const reqs = [
            "# E-Commerce Project Requirements",
            "",
            "## Requirements",
            "- [ ] Implement authentication endpoint",
            "- [ ] Design PostgreSQL database schema for products",
            "- [ ] Create frontend catalog page in React",
            "- [ ] Set up Docker deployment scripts"
        ].join("\n");
        fs.writeFileSync(path.join(docsDir, "requirements.md"), reqs);

        // Run the plan command
        await planCommand();

        // 1. Check if tasks are in Storage
        const tasks = Storage.getTasks();
        expect(tasks.length).toBeGreaterThanOrEqual(4);

        // 2. Verify dependencies & capability routing
        const authTask = tasks.find(t => t.description.includes("authentication"));
        expect(authTask).toBeDefined();
        expect(authTask!.agent).toBe("@security");
        // dependencies should be an array
        expect(Array.isArray(authTask!.dependencies)).toBe(true);
        expect(authTask!.dependencies.length).toBe(0);

        // Find Database task (routed to @database)
        const dbTask = tasks.find(t => t.description.includes("database schema"));
        expect(dbTask).toBeDefined();
        expect(dbTask!.agent).toBe("@database");
        expect(dbTask!.dependencies).toContain(authTask!.id);

        // Find Frontend task (routed to @frontend)
        const frontendTask = tasks.find(t => t.description.includes("frontend catalog"));
        expect(frontendTask).toBeDefined();
        expect(frontendTask!.agent).toBe("@frontend");
        expect(frontendTask!.dependencies).toContain(dbTask!.id);
    });
});
