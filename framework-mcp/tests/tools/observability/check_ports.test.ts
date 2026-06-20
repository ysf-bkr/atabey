import { describe, it, expect, vi, afterEach } from "vitest";
import { handleCheckPorts } from "../../../src/tools/observability/check_ports.js";
import { spawnSync } from "child_process";

vi.mock("child_process");

describe("handleCheckPorts", () => {
    const projectRoot = "/fake/project";

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("should sanitize and run with a normal filter", () => {
        const args = { filter: ":3000" };
        vi.mocked(spawnSync).mockReturnValue({
            stdout: "tcp 0 0 *:3000 LISTEN\ntcp 0 0 *:8080 LISTEN",
            stderr: "",
            output: [],
            pid: 123,
            signal: null,
            status: 0
        } as any);

        const result = handleCheckPorts(projectRoot, args);

        expect(spawnSync).toHaveBeenCalledWith(
            process.platform === "win32" ? "netstat" : "lsof",
            process.platform === "win32" ? ["-ano"] : ["-i", "-P", "-n"],
            { encoding: "utf8" }
        );
        expect(result.content[0].text).toContain("tcp 0 0 *:3000 LISTEN");
        expect(result.content[0].text).not.toContain("tcp 0 0 *:8080 LISTEN");
    });

    it("should strip malicious characters to prevent command injection", () => {
        const args = { filter: "; rm -rf /" };
        // The malicious filter "; rm -rf /" should be sanitized to "rm-rf" by:
        // rawFilter.replace(/[^a-zA-Z0-9.:_-]/g, ""); -> "rm-rf"
        // Then filtered on stdout lines:
        vi.mocked(spawnSync).mockReturnValue({
            stdout: "tcp 0 0 *:3000 LISTEN rm-rf\ntcp 0 0 *:8080 LISTEN",
            stderr: "",
            output: [],
            pid: 123,
            signal: null,
            status: 0
        } as any);

        const result = handleCheckPorts(projectRoot, args);

        expect(spawnSync).toHaveBeenCalled();
        expect(result.content[0].text).toContain("rm-rf");
        expect(result.content[0].text).not.toContain("tcp 0 0 *:8080 LISTEN");
    });
});

