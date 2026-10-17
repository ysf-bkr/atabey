/**
 * Outbound HTTP(S) helper with TLS 1.3 / mTLS client-certificate support.
 *
 * Node's global `fetch` does not expose per-request client certificates, so
 * Atabey tooling that performs outbound requests uses this `http`/`https`
 * based transport instead. It performs a SINGLE request (no redirect
 * following) and returns the raw response so callers can re-validate each hop
 * (e.g. SSRF checks) before continuing.
 */

import http from "http";
import https from "https";
import { URL } from "url";
import { resolveOutboundTlsOptions } from "./tls.js";

export interface OutboundRequestInput {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    /** Max response body bytes to buffer (default 5 MiB). */
    maxBytes?: number;
}

export interface OutboundResponse {
    status: number;
    headers: http.IncomingHttpHeaders;
    text: string;
    /** Redirect target (from the Location header), if any. */
    location?: string;
    finalUrl: string;
}

/**
 * Perform a single outbound request. TLS client options come from
 * `resolveOutboundTlsOptions()` (ATABEY_TLS_CLIENT_* env vars).
 */
export function outboundRequest(input: OutboundRequestInput): Promise<OutboundResponse> {
    return new Promise<OutboundResponse>((resolve, reject) => {
        let parsed: URL;
        try {
            parsed = new URL(input.url);
        } catch {
            reject(new Error(`Invalid URL: ${input.url}`));
            return;
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            reject(new Error(`Protocol '${parsed.protocol}' not supported (only http:/https:).`));
            return;
        }

        const isHttps = parsed.protocol === "https:";
        const mod = isHttps ? https : http;
        const tls = isHttps ? resolveOutboundTlsOptions() : null;
        const maxBytes = input.maxBytes ?? 5 * 1024 * 1024;

        const requestOptions: https.RequestOptions = {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: `${parsed.pathname}${parsed.search}`,
            method: (input.method || "GET").toUpperCase(),
            headers: {
                // Avoid transparent compression so we buffer exactly what was sent.
                "Accept-Encoding": "identity",
                ...(input.headers || {}),
            },
        };

        if (isHttps && tls) {
            requestOptions.minVersion = tls.options.minVersion;
            if (tls.options.cert) requestOptions.cert = tls.options.cert;
            if (tls.options.key) requestOptions.key = tls.options.key;
            if (tls.options.ca) requestOptions.ca = tls.options.ca;
            if (tls.options.servername) requestOptions.servername = tls.options.servername;
        }

        const req = mod.request(requestOptions, (res) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size <= maxBytes) chunks.push(chunk);
            });
            res.on("end", () => {
                resolve({
                    status: res.statusCode || 0,
                    headers: res.headers,
                    text: Buffer.concat(chunks).toString("utf8"),
                    location: typeof res.headers.location === "string" ? res.headers.location : undefined,
                    finalUrl: input.url,
                });
            });
            res.on("error", reject);
        });

        const timeoutMs = input.timeoutMs ?? 30000;
        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error(`Outbound request timed out after ${timeoutMs}ms`));
        });
        req.on("error", reject);

        if (input.body !== undefined) req.write(input.body);
        req.end();
    });
}
