import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    buildErrorReport,
    formatReport,
    listErrorReports,
    manualReportUrl,
    readErrorReport,
    resolveTelemetry,
    sanitizeText,
    submitErrorReport,
    writeErrorReport,
    type ErrorReport,
} from "../../src/cli/utils/diagnostics.js";

/**
 * Error reports leave the machine when the user opts in, so the redaction
 * contract is a security boundary, not a nicety. Every assertion here guards a
 * specific leak: home directory, project name, tokens, env values, file content.
 */
describe("diagnostics: sanitization", () => {
    const projectRoot = "/Users/someone/work/secret-client-project";

    it("replaces the project root with <project> before the home directory", () => {
        const out = sanitizeText(`failed to write ${projectRoot}/.atabey/config.json`, projectRoot);
        expect(out).toBe("failed to write <project>/.atabey/config.json");
        // The project name must not survive.
        expect(out).not.toContain("secret-client-project");
    });

    it("collapses the home directory to ~", () => {
        const out = sanitizeText(`reading ${os.homedir()}/notes.txt failed`, "/nonexistent");
        expect(out.startsWith("reading ~/notes.txt")).toBe(true);
        expect(out).not.toContain(os.homedir());
    });

    it("strips remaining absolute user paths down to two segments", () => {
        const out = sanitizeText("open /Users/otherperson/private/thing.ts failed", "/nonexistent");
        expect(out).not.toContain("otherperson");
        expect(out).toContain("<path>/private/thing.ts");
    });

    it("redacts API keys and bearer tokens", () => {
        const out = sanitizeText(
            "token sk-live-abcdefghijklmnop1234 and Bearer abcdefghijklmnopqrstuvwxyz012345",
            projectRoot,
        );
        expect(out).not.toContain("sk-live-abcdefghijklmnop1234");
        expect(out).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
        expect(out).toContain("REDACTED");
    });

    it("masks PII (emails, phone numbers)", () => {
        const out = sanitizeText("contact dev@example.com or +90 555 123 4567", projectRoot);
        expect(out).not.toContain("dev@example.com");
        expect(out).not.toContain("555 123 4567");
    });

    it("drops the value entirely when a credential pattern survives masking", () => {
        // github_pat_ is long enough that a partial mask could leave fragments.
        const out = sanitizeText("ghp_" + "a".repeat(40), projectRoot);
        expect(out).not.toMatch(/a{20,}/);
    });
});

describe("diagnostics: report contents", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-report-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const makeError = () => {
        const err = new Error(`ENOENT: no such file or directory, open '${dir}/.atabey/config.json'`) as NodeJS.ErrnoException;
        err.code = "ENOENT";
        return err;
    };

    it("captures version, node, OS, command, stage and error code", () => {
        const report = buildErrorReport({
            command: "update",
            stage: "config-refresh",
            error: makeError(),
            projectRoot: dir,
            atabeyVersion: "0.1.7",
        });

        expect(report.id).toMatch(/^RPT-\d{8}-[0-9A-F]{6}$/);
        expect(report.atabeyVersion).toBe("0.1.7");
        expect(report.nodeVersion).toBe(process.versions.node);
        expect(report.platform).toBe(process.platform);
        expect(report.command).toBe("update");
        expect(report.stage).toBe("config-refresh");
        expect(report.errorCode).toBe("ENOENT");
    });

    it("contains no absolute project path and no secrets", () => {
        process.env.OPENAI_API_KEY = "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa";
        try {
            const report = buildErrorReport({
                command: "update",
                stage: "mcp-config",
                error: new Error(`cannot write ${dir}/x.json with sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa`),
                projectRoot: dir,
                atabeyVersion: "0.1.7",
            });
            const serialized = JSON.stringify(report);
            expect(serialized).not.toContain(dir);
            expect(serialized).not.toContain("sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa");
        } finally {
            delete process.env.OPENAI_API_KEY;
        }
    });

    it("never includes environment variable values", () => {
        process.env.MCP_AUTH_TOKEN = "super-secret-token-value";
        try {
            const report = buildErrorReport({
                command: "mcp",
                error: new Error("boom"),
                projectRoot: dir,
                atabeyVersion: "0.1.7",
            });
            expect(JSON.stringify(report)).not.toContain("super-secret-token-value");
        } finally {
            delete process.env.MCP_AUTH_TOKEN;
        }
    });

    it("defaults the stage to unknown when not supplied", () => {
        const report = buildErrorReport({
            command: "atabey",
            error: new Error("boom"),
            projectRoot: dir,
            atabeyVersion: "0.1.7",
        });
        expect(report.stage).toBe("unknown");
    });

    it("handles non-Error throwables without crashing", () => {
        for (const thrown of ["a string", 42, { weird: true }, null]) {
            const report = buildErrorReport({
                command: "update",
                error: thrown,
                projectRoot: dir,
                atabeyVersion: "0.1.7",
            });
            expect(report.message.length).toBeGreaterThan(0);
        }
    });
});

describe("diagnostics: local storage", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-report-store-"));
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    const report = (): ErrorReport => buildErrorReport({
        command: "update",
        stage: "agents",
        error: new Error("kaboom"),
        projectRoot: dir,
        atabeyVersion: "0.1.7",
    });

    it("writes, reads and lists reports", () => {
        const r = report();
        const file = writeErrorReport(r, dir);

        expect(fs.existsSync(file)).toBe(true);
        expect(readErrorReport(r.id, dir)?.id).toBe(r.id);
        expect(listErrorReports(dir)).toContain(`${r.id}.json`);
    });

    it("writes the file with owner-only permissions", () => {
        if (process.platform === "win32") return;
        const r = report();
        const file = writeErrorReport(r, dir);
        const mode = fs.statSync(file).mode & 0o777;
        expect(mode & 0o077).toBe(0); // no group/other access
    });

    it("returns null for an unknown id", () => {
        expect(readErrorReport("RPT-00000000-000000", dir)).toBeNull();
    });
});

describe("diagnostics: sharing is opt-in", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-telemetry-"));
        fs.mkdirSync(path.join(dir, ".atabey"), { recursive: true });
        delete process.env.ATABEY_TELEMETRY;
        delete process.env.ATABEY_REPORT_ENDPOINT;
        delete process.env.ATABEY_REPORT_REPO;
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
        delete process.env.ATABEY_TELEMETRY;
        delete process.env.ATABEY_REPORT_ENDPOINT;
        delete process.env.ATABEY_REPORT_REPO;
    });

    it("is disabled by default", () => {
        expect(resolveTelemetry(dir).enabled).toBe(false);
    });

    it("stays disabled for a typo'd value", () => {
        process.env.ATABEY_TELEMETRY = "yes-please";
        expect(resolveTelemetry(dir).enabled).toBe(false);
    });

    it("is enabled by ATABEY_TELEMETRY=1", () => {
        process.env.ATABEY_TELEMETRY = "1";
        expect(resolveTelemetry(dir).enabled).toBe(true);
    });

    it("is enabled by config telemetry.enabled", () => {
        fs.writeFileSync(path.join(dir, ".atabey", "config.json"), JSON.stringify({ telemetry: { enabled: true } }));
        expect(resolveTelemetry(dir).enabled).toBe(true);
    });

    it("lets config disable an env-enabled default", () => {
        process.env.ATABEY_TELEMETRY = "1";
        fs.writeFileSync(path.join(dir, ".atabey", "config.json"), JSON.stringify({ telemetry: { enabled: false } }));
        expect(resolveTelemetry(dir).enabled).toBe(false);
    });

    it("reads endpoint and repo from env or config", () => {
        process.env.ATABEY_REPORT_ENDPOINT = "https://example.test/report";
        expect(resolveTelemetry(dir).endpoint).toBe("https://example.test/report");

        fs.writeFileSync(path.join(dir, ".atabey", "config.json"), JSON.stringify({ telemetry: { repo: "me/repo" } }));
        expect(resolveTelemetry(dir).repo).toBe("me/repo");
    });
});

describe("diagnostics: presentation", () => {
    const report = (): ErrorReport => ({
        id: "RPT-20261024-ABCDEF",
        createdAt: "2026-10-24T00:00:00.000Z",
        atabeyVersion: "0.1.7",
        nodeVersion: "22.0.0",
        platform: "linux",
        osRelease: "6.0",
        arch: "x64",
        command: "update",
        stage: "mcp-config",
        errorName: "Error",
        errorCode: "EACCES",
        message: "denied",
        stack: "Error: denied\n    at <project>/x.ts:1:1",
    });

    it("formats markdown with the stage and id", () => {
        const body = formatReport(report());
        expect(body).toContain("RPT-20261024-ABCDEF");
        expect(body).toContain("mcp-config");
        expect(body).toContain("EACCES");
        expect(body).toContain("0.1.7");
    });

    it("builds a prefilled issue URL", () => {
        const url = manualReportUrl(report());
        expect(url.startsWith("https://github.com/ysf-bkr/atabey/issues/new")).toBe(true);
        expect(url).toContain("RPT-20261024-ABCDEF");
    });

    it("keeps the URL bounded for a huge stack", () => {
        const huge = { ...report(), stack: "x".repeat(20_000) };
        const url = manualReportUrl(huge);
        expect(url.length).toBeLessThan(2000);
        expect(url).toContain("RPT-20261024-ABCDEF");
    });
});


describe("diagnostics: submission never loses the local copy", () => {
    const report = (): ErrorReport => ({
        id: "RPT-20261024-ABCDEF",
        createdAt: "2026-10-24T00:00:00.000Z",
        atabeyVersion: "0.1.7",
        nodeVersion: "22.0.0",
        platform: "linux",
        osRelease: "6.0",
        arch: "x64",
        command: "update",
        stage: "agents",
        errorName: "Error",
        message: "boom",
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("posts to the configured endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
        vi.stubGlobal("fetch", fetchMock);

        const result = await submitErrorReport(report(), { enabled: true, endpoint: "https://example.test/r" });

        expect(result.submitted).toBe(true);
        expect(result.via).toBe("endpoint");
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://example.test/r");
        expect(init.method).toBe("POST");
        // The body is the report itself, already sanitized upstream.
        expect(JSON.parse(init.body).id).toBe("RPT-20261024-ABCDEF");
    });

    it("reports a non-2xx response as a failure instead of throwing", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 } as Response));
        const result = await submitErrorReport(report(), { enabled: true, endpoint: "https://example.test/r" });
        expect(result.submitted).toBe(false);
        expect(result.error).toContain("503");
    });

    it("reports a network error as a failure instead of throwing", async () => {
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
        const result = await submitErrorReport(report(), { enabled: true, endpoint: "https://example.test/r" });
        expect(result.submitted).toBe(false);
        expect(result.error).toContain("ECONNREFUSED");
    });

    it("returns a failure when no target is configured", async () => {
        const result = await submitErrorReport(report(), { enabled: true });
        expect(result.submitted).toBe(false);
        expect(result.error).toMatch(/no submission target/);
    });
});
