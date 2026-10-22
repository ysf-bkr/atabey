import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    buildSeatbeltArgs,
    clearSandboxRuntimeCache,
    resolveSandboxRuntimeConfig,
    SandboxRequiredError,
    SEATBELT_BINARY,
    runInSandbox,
} from "../src/modules/sandbox/sandbox-runtime.js";
import { clearSandboxIdentityCache } from "../src/modules/sandbox/sandbox.js";

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
        execFileSync: vi.fn(() => {
            throw new Error("not found");
        }),
    };
});

import { spawn, execFileSync } from "child_process";

describe("sandbox-runtime (local OS isolation)", () => {
    afterEach(() => {
        clearSandboxRuntimeCache();
        clearSandboxIdentityCache();
        delete process.env.ATABEY_SANDBOX_RUNTIME;
        delete process.env.ATABEY_SANDBOX_REQUIRED;
        delete process.env.ATABEY_SANDBOX_ENGINE;
        delete process.env.ATABEY_SANDBOX_UID;
        vi.clearAllMocks();
    });

    it("resolves auto → none when seatbelt probe fails and no uid configured", () => {
        process.env.ATABEY_SANDBOX_RUNTIME = "auto";
        const cfg = resolveSandboxRuntimeConfig("/tmp/project");
        expect(cfg.effectiveMode).toBe("none");
        expect(cfg.mode).toBe("auto");
    });

    it("resolves seatbelt mode with forced engine detection mock failure → none", () => {
        process.env.ATABEY_SANDBOX_RUNTIME = "seatbelt";
        const cfg = resolveSandboxRuntimeConfig("/tmp/project");
        expect(cfg.effectiveMode).toBe("none");
    });

    it("buildSeatbeltArgs confines file-write to projectRoot and denies network", () => {
        const cfg = resolveSandboxRuntimeConfig("/proj");
        cfg.effectiveMode = "seatbelt";
        cfg.engine = "seatbelt";
        cfg.projectRoot = "/proj";
        const args = buildSeatbeltArgs(cfg, "git", ["status"]);
        expect(args[0]).toBe("-p");
        expect(args[1]).toContain("(version 1)");
        expect(args[1]).toContain("(deny network*)");
        expect(args[1]).toContain('(deny file-write* (subpath "/"))');
        expect(args[1]).toContain('(subpath "/proj")');
        expect(args[2]).toBe("git");
        expect(args[3]).toBe("status");
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

    it("uses macOS seatbelt (/usr/bin/sandbox-exec) when detection succeeds", async () => {
        clearSandboxRuntimeCache();
        vi.mocked(execFileSync).mockImplementation((cmd: string) => {
            if (cmd === SEATBELT_BINARY) return "";
            throw new Error("not found");
        });
        process.env.ATABEY_SANDBOX_RUNTIME = "seatbelt";
        process.env.ATABEY_SANDBOX_REQUIRED = "false";

        const result = await runInSandbox({
            command: "git",
            args: ["status"],
            projectRoot: process.cwd(),
        });

        expect(result.runtime).toBe("seatbelt");
        expect(result.engine).toBe("seatbelt");
        expect(spawn).toHaveBeenCalledWith(
            SEATBELT_BINARY,
            expect.arrayContaining(["-p", "git", "status"]),
            expect.any(Object),
        );
    });

    it("defaults required=true when NODE_ENV=production", () => {
        const prevNodeEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = "production";
            const cfg = resolveSandboxRuntimeConfig("/tmp/project");
            expect(cfg.required).toBe(true);
        } finally {
            if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
            else process.env.NODE_ENV = prevNodeEnv;
        }
    });

    it("scrubs sensitive environment variables before spawning child process", async () => {
        process.env.ATABEY_SANDBOX_RUNTIME = "none";
        process.env.ATABEY_SANDBOX_REQUIRED = "false";
        await runInSandbox({
            command: "echo",
            args: ["hi"],
            projectRoot: process.cwd(),
            env: {
                PATH: "/usr/bin",
                OPENAI_API_KEY: "sk-proj-secret12345678901234567890",
                SAFE_VAR: "visible",
            },
        });
        const spawnCallOpts = vi.mocked(spawn).mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv } | undefined;
        expect(spawnCallOpts?.env?.SAFE_VAR).toBe("visible");
        expect(spawnCallOpts?.env?.OPENAI_API_KEY).toBeUndefined();
    });
});


