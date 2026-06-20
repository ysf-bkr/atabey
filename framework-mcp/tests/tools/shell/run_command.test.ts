import { describe, it, expect, vi, afterEach } from "vitest";
import { handleRunCommand } from "../../../src/tools/shell/run_command.js";
import { exec } from "child_process";

vi.mock("child_process");

describe("handleRunCommand", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should execute an allowed command", async () => {
        const args = { command: "git status" };
        
        vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
            // @ts-expect-error: Mock implementation callback type is complex
            callback(null, "On branch main", "");
            return {} as any;
        });

        const result = await handleRunCommand(projectRoot, args);
        
        expect(exec).toHaveBeenCalledWith("git status", { cwd: projectRoot, timeout: 30000 }, expect.any(Function));
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("On branch main");
    });

    it("should reject a disallowed command", async () => {
        const args = { command: "rm -rf /" };
        const result = await handleRunCommand(projectRoot, args);
        
        expect(exec).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command not allowed");
    });

    it("should reject command injection attempts", async () => {
        const args = { command: "git status && echo injected" };
        const result = await handleRunCommand(projectRoot, args);
        
        expect(exec).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command rejected: Shell metacharacters are forbidden");
    });

    it("should handle command failure", async () => {
        const args = { command: "npm run build" };

        vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
            // @ts-expect-error: Mock implementation callback type is complex
            callback({ code: 1, message: "Build failed" }, "", "Error details");
            return {} as any;
        });

        const result = await handleRunCommand(projectRoot, args);

        expect(exec).toHaveBeenCalledWith("npm run build", { cwd: projectRoot, timeout: 30000 }, expect.any(Function));
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Command failed with exit code 1");
        expect(result.content[0].text).toContain("Error details");
    });
});
