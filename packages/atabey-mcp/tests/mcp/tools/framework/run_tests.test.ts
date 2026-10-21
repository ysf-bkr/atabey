import { describe, it, expect, vi, afterEach } from "vitest";
import { handleRunTests } from "../../../../src/mcp/tools/framework/run_tests.js";
import { execFileSync } from "child_process";

vi.mock("child_process");

describe("handleRunTests", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should execute a valid default test command", () => {
        vi.mocked(execFileSync).mockReturnValue("All tests passed");

        const result = handleRunTests(projectRoot, {});

        expect(execFileSync).toHaveBeenCalledWith("npm", ["test"], expect.objectContaining({ cwd: projectRoot, encoding: "utf8", stdio: "pipe" }));
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("Tests passed successfully");
    });

    it("should execute an allowed custom test command", () => {
        vi.mocked(execFileSync).mockReturnValue("Vitest result");

        const result = handleRunTests(projectRoot, { command: "npx vitest run" });

        expect(execFileSync).toHaveBeenCalledWith("npx", ["vitest", "run"], expect.objectContaining({ cwd: projectRoot, encoding: "utf8", stdio: "pipe" }));
        expect(result.isError).toBeUndefined();
    });

    it("should reject a test command not in allow list", () => {
        const result = handleRunTests(projectRoot, { command: "rm -rf /" });

        expect(execFileSync).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Test command not allowed");
    });

    it("should reject a non-test npm run script", () => {
        const result = handleRunTests(projectRoot, { command: "npm run deploy" });

        expect(execFileSync).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Test command not allowed");
    });

    it("should reject a test command with injection attempt", () => {
        const result = handleRunTests(projectRoot, { command: "npm test; echo injected" });

        expect(execFileSync).not.toHaveBeenCalled();
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Shell metacharacters are forbidden");
    });

    it("should handle test command failures", () => {
        vi.mocked(execFileSync).mockImplementation(() => {
            const err = new Error("Failed");
            (err as any).stdout = Buffer.from("Fail stdout");
            (err as any).stderr = Buffer.from("Fail stderr");
            throw err;
        });

        const result = handleRunTests(projectRoot, {});

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Tests FAILED");
        expect(result.content[0].text).toContain("Fail stdout");
        expect(result.content[0].text).toContain("Fail stderr");
    });
});
