import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    assertSafeRelativePath,
    writeFileInSandbox,
} from "../src/sandbox-fs.js";
import { SandboxRequiredError } from "../src/sandbox-runtime.js";
import { clearSandboxRuntimeCache } from "../src/sandbox-runtime.js";
import { clearSandboxIdentityCache } from "../src/sandbox.js";

describe("sandbox-fs", () => {
    let tmp: string;

    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-sfs-"));
        clearSandboxRuntimeCache();
        clearSandboxIdentityCache();
        process.env.ATABEY_SANDBOX_RUNTIME = "none";
        delete process.env.ATABEY_SANDBOX_REQUIRED;
    });

    afterEach(() => {
        fs.rmSync(tmp, { recursive: true, force: true });
        delete process.env.ATABEY_SANDBOX_RUNTIME;
        delete process.env.ATABEY_SANDBOX_REQUIRED;
        clearSandboxRuntimeCache();
        clearSandboxIdentityCache();
    });

    it("rejects path traversal", () => {
        expect(() => assertSafeRelativePath("../etc/passwd")).toThrow(/traversal/i);
        expect(() => assertSafeRelativePath("/etc/passwd", tmp)).toThrow(/escapes|Absolute|project root/i);
    });

    it("accepts absolute paths inside project root", () => {
        const abs = path.join(tmp, "nested", "a.ts");
        const rel = assertSafeRelativePath(abs, tmp);
        expect(rel).toBe("nested/a.ts");
    });

    it("writes on host when runtime is none", async () => {
        const result = await writeFileInSandbox(tmp, "src/hello.ts", "export const x = 1;");
        expect(result.runtime).toBe("none");
        expect(fs.readFileSync(path.join(tmp, "src/hello.ts"), "utf8")).toContain("export const x");
        // lock released
        expect(fs.existsSync(path.join(tmp, ".atabey", "locks", "src/hello.ts.lock"))).toBe(false);
    });

    it("releases lock when write path is invalid after acquire", async () => {
        await expect(writeFileInSandbox(tmp, "", "x")).rejects.toThrow();
    });

    it("blocks write when sandbox required and isolation is none", async () => {
        process.env.ATABEY_SANDBOX_REQUIRED = "true";
        process.env.ATABEY_SANDBOX_RUNTIME = "none";
        await expect(writeFileInSandbox(tmp, "a.ts", "x")).rejects.toBeInstanceOf(SandboxRequiredError);
    });
});
