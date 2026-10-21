/**
 * OpenTelemetry-compatible tracing without an SDK dependency.
 *
 * Produces W3C Trace Context ids and OTLP-shaped span records, written as
 * JSON Lines to `.atabey/telemetry/otel.jsonl` (and optionally pushed to an
 * OTLP/HTTP collector via OTEL_EXPORTER_OTLP_ENDPOINT). This lets enterprise
 * teams ship Atabey's tool spans to Datadog/Jaeger/Grafana/ELK without Atabey
 * taking a hard dependency on the OTel SDK.
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export interface SpanAttributes {
    [key: string]: string | number | boolean | undefined;
}

export interface SpanRecord {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTimeUnixNano: string;
    endTimeUnixNano: string;
    attributes: Record<string, string | number | boolean>;
    status: "OK" | "ERROR";
}

export function newTraceId(): string {
    return crypto.randomBytes(16).toString("hex");
}

export function newSpanId(): string {
    return crypto.randomBytes(8).toString("hex");
}

/** W3C traceparent header for the given ids. */
export function formatTraceparent(traceId: string, spanId: string, sampled = true): string {
    return `00-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

function cleanAttributes(attributes: SpanAttributes): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(attributes)) {
        if (v !== undefined) out[k] = v;
    }
    return out;
}

/**
 * Emit a span record. Best-effort: telemetry must never break tool execution.
 */
export function emitSpan(projectRoot: string, span: {
    name: string;
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    startMs: number;
    endMs: number;
    attributes?: SpanAttributes;
    status?: "OK" | "ERROR";
}): SpanRecord {
    const record: SpanRecord = {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        startTimeUnixNano: String(BigInt(Math.round(span.startMs)) * 1_000_000n),
        endTimeUnixNano: String(BigInt(Math.round(span.endMs)) * 1_000_000n),
        attributes: cleanAttributes(span.attributes || {}),
        status: span.status || "OK",
    };

    try {
        const effectiveRoot = process.env.VITEST && path.resolve(projectRoot) === path.resolve(process.cwd())
            ? path.join(os.tmpdir(), `atabey-vitest-worker-${process.pid}`)
            : projectRoot;
        const dir = path.join(effectiveRoot, ".atabey", "telemetry");
        fs.mkdirSync(dir, { recursive: true });
        fs.appendFileSync(path.join(dir, "otel.jsonl"), `${JSON.stringify(record)}\n`);
    } catch {
        /* best-effort */
    }

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
    if (endpoint) {
        void pushOtlp(endpoint, record).catch(() => { /* ignore */ });
    }

    return record;
}

async function pushOtlp(endpoint: string, record: SpanRecord): Promise<void> {
    const url = endpoint.replace(/\/$/, "") + "/v1/traces";
    const body = JSON.stringify({
        resourceSpans: [{
            resource: { attributes: [{ key: "service.name", value: { stringValue: "atabey" } }] },
            scopeSpans: [{ spans: [{
                traceId: record.traceId,
                spanId: record.spanId,
                parentSpanId: record.parentSpanId,
                name: record.name,
                startTimeUnixNano: record.startTimeUnixNano,
                endTimeUnixNano: record.endTimeUnixNano,
                attributes: Object.entries(record.attributes).map(([k, v]) => ({
                    key: k,
                    value: typeof v === "number"
                        ? { doubleValue: v }
                        : typeof v === "boolean"
                          ? { boolValue: v }
                          : { stringValue: String(v) },
                })),
                status: { code: record.status === "ERROR" ? 2 : 1 },
            }] }],
        }],
    });
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
    }).catch(() => { /* collector may be unreachable */ });
}
