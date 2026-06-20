import { describe, it, expect, vi, afterEach } from "vitest";
import { handleCheckPorts } from "../../../src/tools/observability/check_ports.js";
import { execSync } from "child_process";

vi.mock("child_process");

describe("handleCheckPorts", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should sanitize and run with a normal filter", () => {
        const args = { filter: ":3000" };
        vi.mocked(execSync).mockReturnValue("tcp 0 0 *:3000 LISTEN" as any);

        const result = handleCheckPorts(projectRoot, args);

        expect(execSync).toHaveBeenCalled();
        const calledCommand = vi.mocked(execSync).mock.calls[0][0] as string;
        expect(calledCommand).toContain(":3000");
        expect(result.content[0].text).toContain("tcp 0 0 *:3000 LISTEN");
    });

    it("should strip malicious characters to prevent command injection", () => {
        const args = { filter: "; rm -rf /" };
        vi.mocked(execSync).mockReturnValue("some list" as any);

        handleCheckPorts(projectRoot, args);

        expect(execSync).toHaveBeenCalled();
        const calledCommand = vi.mocked(execSync).mock.calls[0][0] as string;
        // The malicious filter "; rm -rf /" should be sanitized to "rm-rf"
        expect(calledCommand).not.toContain(";");
        expect(calledCommand).toContain("grep rm-rf");
    });
});
