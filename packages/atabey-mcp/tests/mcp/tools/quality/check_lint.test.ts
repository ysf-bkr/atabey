import { describe, it, expect, vi, afterEach } from "vitest";
import { handleCheckLint } from "../../../../src/mcp/tools/quality/check_lint.js";
import { exec } from "child_process";

vi.mock("child_process");

describe("handleCheckLint", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should execute the lint command and return output on success", async () => {
        const args = {};
        
        vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
            // @ts-expect-error: Mock implementation callback type is complex
            callback(null, "All good!", "");
            return {} as any;
        });

        const result = await handleCheckLint(projectRoot, args);
        
        expect(exec).toHaveBeenCalledWith("npm run lint", { cwd: projectRoot, timeout: 60000 }, expect.any(Function));
        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain("All good!");
    });

    it("should execute the lint command and return output on failure (lint issues found)", async () => {
        const args = {};
        const lintErrorOutput = "Error: 2 problems (2 errors, 0 warnings)";
        
        vi.mocked(exec).mockImplementation((_cmd, _opts, callback) => {
            // @ts-expect-error: Mock implementation callback type is complex
            callback({ code: 1, message: "Lint errors found" }, lintErrorOutput, "");
            return {} as any;
        });

        const result = await handleCheckLint(projectRoot, args);
        
        expect(exec).toHaveBeenCalledWith("npm run lint", { cwd: projectRoot, timeout: 60000 }, expect.any(Function));
        expect(result.isError).toBe(true); // Implementation returns isError: true on failure
        expect(result.content[0].text).toContain(lintErrorOutput);
    });
});
