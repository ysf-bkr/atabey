import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildContainerArgs,
    clearSandboxRuntimeCache,
    resolveSandboxRuntimeConfig,
    SandboxRequiredError,
    runInSandbox,
} from "../src/sandbox-runtime.js";
import { clearSandboxIdentityCache } from "../src/sandbox.js";

vi.mock("child_process", async (importOriginal) => {
    const actual = await importOriginal<typeof import("child_process")>();
    return {
        ...actual,
        spawn: vi.fn(() => {
            const child = new EventEmitter() as any;
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            process.nextTick(() => {
                child.stdout.emit("data", Buffer.from("ok\n"));
                child.emit("close", 0);
            });
            return child;
        }),
        execFileSync: vi.fn((cmd: string) => {
            if (cmd === "podman" || cmd === "docker") {
                throw new Error("not found");
            }
            throw new Error("not found");
        }),
    };
});

import { spawn, execFileSync } from "child_process";

describe("sandbox-runtime", () => {
    afterEach(() => {
        clearSandboxRuntimeCache();
        clearSandboxIdentityCache();
        delete process.env.ATABEY_SANDBOX_RUNTIME;
        delete process.env.ATABEY_SANDBOX_REQUIRED;
        delete process.env.ATABEY_SANDBOX_ENGINE;
        delete process.env.ATABEY_SANDBOX_IMAGE;
        delete process.env.ATABEY_SANDBOX_UID;
        vi.clearAllMocks();
    });

    it("resolves auto → none when no engine and no uid", () => {
        process.env.ATABEY_SANDBOX_RUNTIME = "auto";
        const cfg = resolveSandboxRuntimeConfig("/tmp/project");
        expect(cfg.effectiveMode).toBe("none");
        expect(cfg.mode).toBe("auto");
    });

    it("resolves container mode with forced engine detection mock failure → none", () => {
        process.env.ATABEY_SANDBOX_RUNTIME = "container";
        const cfg = resolveSandboxRuntimeConfig("/tmp/project");
        expect(cfg.effectiveMode).toBe("none");
    });

    it("buildContainerArgs mounts project and disables network", () => {
        process.env.ATABEY_SANDBOX_IMAGE = "node:20-bookworm-slim";
        const cfg = resolveSandboxRuntimeConfig("/proj");
        cfg.effectiveMode = "container";
        cfg.engine = "docker";
        cfg.projectRoot = "/proj";
        const args = buildContainerArgs(cfg, "git", ["status"]);
        expect(args).toContain("run");
        expect(args).toContain("--rm");
        expect(args).toContain("--network");
        expect(args).toContain("none");
        expect(args).toContain("-v");
        expect(args.some((a) => a.includes("/proj:/workspace"))).toBe(true);
        expect(args).toContain("-w");
        expect(args).toContain("/workspace");
        expect(args[args.length - 3]).toBe("node:20-bookworm-slim");
        expect(args[args.length - 2]).toBe("git");
        expect(args[args.length - 1]).toBe("status");
    });

    it("throws SandboxRequiredError when required and isolation is none", async () => {
        process.env.ATABEY_SANDBOX_REQUIRED = "true";
        process.env.ATABEY_SANDBOX_RUNTIME = "none";
        await expect(
            runInSandbox({
                command: "echo",
                args: ["hi"],
                projectRoot: process.cwd(),
            }),
        ).rejects.toBeInstanceOf(SandboxRequiredError);
    });

    it("runs on host when mode is none", async () => {
        process.env.ATABEY_SANDBOX_RUNTIME = "none";
        process.env.ATABEY_SANDBOX_REQUIRED = "false";
        const result = await runInSandbox({
            command: "echo",
            args: ["hi"],
            projectRoot: process.cwd(),
        });
        expect(spawn).toHaveBeenCalled();
        expect(result.runtime).toBe("none");
        expect(result.code).toBe(0);
        expect(result.stdout).toContain("ok");
    });

    it("uses docker engine when detection succeeds and mode is container", async () => {
        clearSandboxRuntimeCache();
        vi.mocked(execFileSync).mockImplementation((cmd: string) => {
            if (cmd === "docker") return "Docker version 24.0";
            throw new Error("not found");
        });
        process.env.ATABEY_SANDBOX_RUNTIME = "container";
        process.env.ATABEY_SANDBOX_ENGINE = "docker";
        process.env.ATABEY_SANDBOX_REQUIRED = "false";

        const result = await runInSandbox({
            command: "git",
            args: ["status"],
            projectRoot: process.cwd(),
        });

        expect(result.runtime).toBe("container");
        expect(result.engine).toBe("docker");
        expect(spawn).toHaveBeenCalledWith(
            "docker",
            expect.arrayContaining(["run", "--rm", "--network", "none", "git", "status"]),
            expect.any(Object),
        );
    });
});
