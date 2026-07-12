import { describe, it, expect, vi, afterEach } from "vitest";
import { handleRunCommand } from "../../../../src/mcp/tools/shell/run_command.js";
import { EventEmitter } from "events";

const { mockSandboxSpawn } = vi.hoisted(() => ({
    mockSandboxSpawn: vi.fn(),
}));

vi.mock("atabey-shared/sandbox.js", () => ({
    sandboxSpawn: mockSandboxSpawn,
    resolveSandboxIdentity: () => ({ enabled: false, reason: "test" }),
}));

describe("handleRunCommand", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    // Helper to create a mocked child process
    function createMockChildProcess(stdoutData = "", stderrData = "", exitCode = 0, triggerError = false) {
        const child = new EventEmitter() as any;
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        
        process.nextTick(() => {
            if (triggerError) {
                child.emit("error", new Error("Spawn error"));
                return;
            }
            
            if (stdoutData) {
                child.stdout.emit("data", Buffer.from(stdoutData));
            }
            if (stderrData) {
                child.stderr.emit("data", Buffer.from(stderrData));
            }
            
            child.emit("close", exitCode);
        });
        
        return child;
    }

    it("should execute an allowed command", async () => {
        const args = { command: "git status" };
        
        mockSandboxSpawn.mockReturnValue(createMockChildProcess("On branch main", "") as any);

        const result = await handleRunCommand(projectRoot, args);
        
        expect(mockSandboxSpawn).toHaveBeenCalledWith("git", ["status"], {
            cwd: projectRoot,
            timeout: 30000,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
        });
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("On branch main");
    });

    it("should reject a disallowed command", async () => {
        const args = { command: "rm -rf /" };
        const result = await handleRunCommand(projectRoot, args);
        
        expect(mockSandboxSpawn).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command not allowed");
    });

    it("should reject command injection attempts", async () => {
        const args = { command: "git status && echo injected" };
        const result = await handleRunCommand(projectRoot, args);
        
        expect(mockSandboxSpawn).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command rejected: Shell metacharacters are forbidden");
    });

    it("should handle command failure", async () => {
        const args = { command: "npm run build" };

        mockSandboxSpawn.mockReturnValue(createMockChildProcess("", "Error details", 1) as any);

        const result = await handleRunCommand(projectRoot, args);

        expect(mockSandboxSpawn).toHaveBeenCalledWith("npm", ["run", "build"], {
            cwd: projectRoot,
            timeout: 30000,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
        });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command failed with exit code 1");
        expect(result.content[0].text).toContain("Error details");
    });
});

