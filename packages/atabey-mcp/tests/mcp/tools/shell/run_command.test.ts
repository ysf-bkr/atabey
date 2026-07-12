import { describe, it, expect, vi, afterEach } from "vitest";
import { handleRunCommand } from "../../../../src/mcp/tools/shell/run_command.js";

const { mockRunInSandbox } = vi.hoisted(() => ({
    mockRunInSandbox: vi.fn(),
}));

vi.mock("atabey-shared/sandbox-runtime.js", () => ({
    runInSandbox: mockRunInSandbox,
    SandboxRequiredError: class SandboxRequiredError extends Error {
        constructor(message: string) {
            super(message);
            this.name = "SandboxRequiredError";
        }
    },
    resolveSandboxRuntimeConfig: () => ({
        effectiveMode: "none",
        mode: "auto",
        engine: "none",
    }),
}));

describe("handleRunCommand", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should execute an allowed command via sandbox runtime", async () => {
        const args = { command: "git status" };

        mockRunInSandbox.mockResolvedValue({
            code: 0,
            stdout: "On branch main",
            stderr: "",
            runtime: "none",
            engine: "none",
            isolationLabel: "none (host process)",
        });

        const result = await handleRunCommand(projectRoot, args);

        expect(mockRunInSandbox).toHaveBeenCalledWith({
            command: "git",
            args: ["status"],
            projectRoot,
            timeoutMs: 30000,
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("On branch main");
    });

    it("should reject a disallowed command", async () => {
        const args = { command: "rm -rf /" };
        const result = await handleRunCommand(projectRoot, args);

        expect(mockRunInSandbox).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command not allowed");
    });

    it("should reject command injection attempts", async () => {
        const args = { command: "git status && echo injected" };
        const result = await handleRunCommand(projectRoot, args);

        expect(mockRunInSandbox).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command rejected: Shell metacharacters are forbidden");
    });

    it("should handle command failure from sandbox", async () => {
        const args = { command: "npm run build" };

        mockRunInSandbox.mockResolvedValue({
            code: 1,
            stdout: "",
            stderr: "Error details",
            runtime: "uid",
            engine: "none",
            isolationLabel: "uid=501",
        });

        const result = await handleRunCommand(projectRoot, args);

        expect(mockRunInSandbox).toHaveBeenCalledWith({
            command: "npm",
            args: ["run", "build"],
            projectRoot,
            timeoutMs: 30000,
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command failed with exit code 1");
        expect(result.content[0].text).toContain("Error details");
        expect(result.content[0].text).toContain("sandbox:");
    });
});
