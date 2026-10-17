import { describe, it, expect, vi, afterEach } from "vitest";
import { handleRunCommand, tokenizeCommandLine } from "../../../../src/mcp/tools/shell/run_command.js";

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

    it("should correctly tokenize double and single quoted strings preserving spaces", () => {
        const tokens = tokenizeCommandLine('git commit -m "fix(auth): fix password validation bug"');
        expect(tokens).toEqual(["git", "commit", "-m", "fix(auth): fix password validation bug"]);

        const singleQuoteTokens = tokenizeCommandLine("git commit -m 'feat: add user support'");
        expect(singleQuoteTokens).toEqual(["git", "commit", "-m", "feat: add user support"]);
    });

    it("should execute git commit with quoted message preserving message as a single argument", async () => {
        const args = { command: 'git commit -m "feat(core): initial industrial release"' };

        mockRunInSandbox.mockResolvedValue({
            code: 0,
            stdout: "[main 1234567] feat(core): initial industrial release",
            stderr: "",
            runtime: "none",
            engine: "none",
            isolationLabel: "none",
        });

        const result = await handleRunCommand(projectRoot, args);

        expect(mockRunInSandbox).toHaveBeenCalledWith({
            command: "git",
            args: ["commit", "-m", "feat(core): initial industrial release"],
            projectRoot,
            timeoutMs: 30000,
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("feat(core): initial industrial release");
    });

    it("automatically appends --ignore-scripts to npm install and blocks --foreground-scripts", async () => {
        mockRunInSandbox.mockResolvedValue({
            code: 0,
            stdout: "added 1 package",
            stderr: "",
            runtime: "none",
            engine: "none",
            isolationLabel: "none",
        });

        const okResult = await handleRunCommand(projectRoot, { command: "npm install lodash" });
        expect(okResult.isError).toBeUndefined();
        expect(mockRunInSandbox).toHaveBeenCalledWith({
            command: "npm",
            args: ["install", "lodash", "--ignore-scripts"],
            projectRoot,
            timeoutMs: 30000,
        });

        const blockedResult = await handleRunCommand(projectRoot, {
            command: "npm install lodash --foreground-scripts",
        });
        expect(blockedResult.isError).toBe(true);
        expect(blockedResult.content[0].text).toContain("lifecycle script / config hijack risk");
    });

    it("rejects arbitrary npm run scripts and native build commands when unsandboxed", async () => {
        const evilScript = await handleRunCommand(projectRoot, { command: "npm run evil-postinstall" });
        expect(evilScript.isError).toBe(true);
        expect(evilScript.content[0].text).toContain("not in the safe script allow-list");

        const unsandboxedMake = await handleRunCommand(projectRoot, { command: "make all" });
        expect(unsandboxedMake.isError).toBe(true);
        expect(unsandboxedMake.content[0].text).toContain("requires sandbox isolation");
    });
});

