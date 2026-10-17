import fs from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgentRuntime } from "../../../src/modules/runtime/agent-runtime.js";
import { CodeGraph } from "../../../src/modules/memory/code-graph.js";
import { Storage } from "../../../src/shared/storage.js";
import type { AgentAdapter } from "../../../src/modules/runtime/adapters/types.js";

const TEST_DIR = path.join(os.tmpdir(), "atabey-ctxinj-" + Date.now());
const PROJECT_DIR = path.join(os.tmpdir(), "atabey-ctxinj-proj-" + Date.now());

let capturedSystem: string | undefined;

function capturingAdapter(): AgentAdapter {
    return {
        id: "capture",
        isAvailable: async () => true,
        runTurn: async (req) => {
            capturedSystem = req.systemPrompt;
            return { ok: true, output: "done", exitCode: 0, durationMs: 1, timedOut: false, adapterId: "capture" };
        },
    };
}

beforeAll(() => {
    process.env.ATABEY_TEST_DIR = TEST_DIR;
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(path.join(PROJECT_DIR, "src"), { recursive: true });
    fs.writeFileSync(
        path.join(PROJECT_DIR, "src", "auth.ts"),
        ["export class AuthService {", "  login(): boolean { return true; }", "}"].join("\n"),
    );

    Storage.reset();
    CodeGraph.clear();
    CodeGraph.index(PROJECT_DIR);
});

afterAll(() => {
    Storage.reset();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROJECT_DIR, { recursive: true, force: true });
});

describe("AgentRuntime context injection", () => {
    it("injects a targeted context bundle when context is enabled", async () => {
        capturedSystem = undefined;
        const report = await AgentRuntime.runTurn("@backend", "Add rate limiting to AuthService login", {
            adapter: capturingAdapter(),
            context: true,
            cwd: PROJECT_DIR,
        });
        expect(report.ok).toBe(true);
        expect(capturedSystem).toContain("Context Bundle");
        expect(capturedSystem).toContain("AuthService");
    });

    it("does not inject context when disabled (default)", async () => {
        capturedSystem = "unset";
        await AgentRuntime.runTurn("@backend", "AuthService", {
            adapter: capturingAdapter(),
            cwd: PROJECT_DIR,
        });
        expect(capturedSystem).toBeUndefined();
    });
});
