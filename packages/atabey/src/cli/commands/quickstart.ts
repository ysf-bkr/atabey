import fs from "fs";
import path from "path";
import { writeTextFile } from "../../shared/fs.js";
import { UI } from "../utils/ui.js";

/**
 * [START] Atabey Quickstart — creates a working example project in seconds
 *
 * Sets up a ready-to-use demo project for the user:
 * - docs/ folder with example tasks
 * - Sample task list
 * - Ready-to-execute plan
 */
export async function quickstartCommand() {
    const projectRoot = process.cwd();
    const docsDir = path.join(projectRoot, "docs");
    const exampleTaskFile = path.join(docsDir, "quickstart-tasks.md");

    UI.intent("[Atabey Quickstart]", "Creating example project in 10 seconds...");

    // 1. Create docs/ directory
    if (!fs.existsSync(docsDir)) {
        fs.mkdirSync(docsDir, { recursive: true });
    }

    // 2. Create example task file
    const exampleContent = `# 🚀 Quickstart Tasks — Atabey Order

This is an example task list to demonstrate how Atabey distributes and validates tasks.

## [BACKEND] Backend Tasks

- [ ] Create user login service with JWT authentication
- [ ] Write Vitest unit tests for the login service

## [FRONTEND] Frontend Tasks

- [ ] Create responsive login page using atomic components
- [ ] Connect login page to backend API

## [MOBILE] Mobile Tasks

- [ ] Create user profile page with React Native
- [ ] Implement offline-first architecture

## [QA] Quality Tasks

- [ ] Audit all code for compliance and lint errors
`;

    writeTextFile(exampleTaskFile, exampleContent);
    UI.success(`[OK] docs/quickstart-tasks.md created (${exampleContent.split("\n").length} lines)`);

    // 3. Show user instructions
    process.stdout.write("\n  [Task List]:\n");
    process.stdout.write("  -----------------------------------------\n");
    process.stdout.write("  1.  atabey init          -> Initialize the project\n");
    process.stdout.write("  2.  atabey plan          -> Auto-distribute tasks\n");
    process.stdout.write("  3.  atabey orchestrate   -> Start orchestration\n");
    process.stdout.write("  4.  atabey dashboard     -> Open web panel\n");
    process.stdout.write("\n  [Tip]: To call individual agents:\n");
    process.stdout.write("     atabey @backend \"Create user login service\"\n");
    process.stdout.write("\n");

    UI.success("[OK] Quickstart ready! You can start immediately.");
}
