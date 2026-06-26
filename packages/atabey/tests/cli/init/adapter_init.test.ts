import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADAPTERS } from "../../../src/cli/platforms/core.js";
import { ADAPTER_IDS, runAdapterPostInit, scaffoldAgents } from "../../../src/cli/platforms/index.js";

describe("Adapter Initialization & Scaffolding - Granular Verification", () => {
    let tempDir: string;
    let prevAntigravityDir: string | undefined;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-init-test-"));
        // Redirect global Antigravity plugin writes into the temp dir so tests
        // never pollute the developer's real ~/.gemini/antigravity-cli directory.
        prevAntigravityDir = process.env.ANTIGRAVITY_GLOBAL_DIR;
        process.env.ANTIGRAVITY_GLOBAL_DIR = path.join(tempDir, ".antigravity-global");
        vi.spyOn(process, "cwd").mockReturnValue(tempDir);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
        if (prevAntigravityDir === undefined) {
            delete process.env.ANTIGRAVITY_GLOBAL_DIR;
        } else {
            process.env.ANTIGRAVITY_GLOBAL_DIR = prevAntigravityDir;
        }
        vi.restoreAllMocks();
    });

    ADAPTER_IDS.forEach((adapterId) => {
        describe(`Adapter: ${adapterId}`, () => {
            it("should scaffold agent files and configure MCP", () => {
                const adapter = ADAPTERS[adapterId];

                // 1. Scaffold
                scaffoldAgents(tempDir, adapterId, false);
                if (adapter.agentsDir) {
                    const agentsPath = path.join(tempDir, adapter.agentsDir);
                    expect(fs.existsSync(agentsPath)).toBe(true);
                    // Check if at least one agent file was created
                    const files = fs.readdirSync(agentsPath, { recursive: true });
                    expect(files.length).toBeGreaterThan(0);
                }

                // 2. Post-Init
                runAdapterPostInit(adapter, tempDir);

                // Verification: mcp.json should exist
                expect(fs.existsSync(path.join(tempDir, "mcp.json"))).toBe(true);
            });
        });
    });
});
