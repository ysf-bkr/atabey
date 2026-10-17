import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitSpan, formatTraceparent, newSpanId, newTraceId } from "../src/otel.js";

describe("OpenTelemetry-compatible tracing", () => {
    let dir: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), "atabey-otel-"));
        delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    });
    afterEach(() => {
        delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it("generates W3C trace/span ids and a valid traceparent", () => {
        const traceId = newTraceId();
        const spanId = newSpanId();
        expect(traceId).toMatch(/^[0-9a-f]{32}$/);
        expect(spanId).toMatch(/^[0-9a-f]{16}$/);
        expect(formatTraceparent(traceId, spanId)).toBe(`00-${traceId}-${spanId}-01`);
    });

    it("writes an OTLP-shaped span to otel.jsonl", () => {
        const record = emitSpan(dir, {
            name: "mcp.tool.write_file",
            traceId: newTraceId(),
            spanId: newSpanId(),
            startMs: 1000,
            endMs: 1012,
            attributes: { "mcp.tool": "write_file", ok: true },
        });
        expect(record.status).toBe("OK");
        const line = fs.readFileSync(path.join(dir, ".atabey", "telemetry", "otel.jsonl"), "utf8").trim();
        const parsed = JSON.parse(line) as { name: string; startTimeUnixNano: string; traceId: string };
        expect(parsed.name).toBe("mcp.tool.write_file");
        expect(parsed.traceId).toBe(record.traceId);
        expect(BigInt(parsed.startTimeUnixNano)).toBe(1_000_000_000n);
    });

    it("marks error spans", () => {
        const record = emitSpan(dir, {
            name: "mcp.tool.run_shell_command",
            traceId: newTraceId(),
            spanId: newSpanId(),
            startMs: 0,
            endMs: 1,
            status: "ERROR",
        });
        expect(record.status).toBe("ERROR");
    });
});
