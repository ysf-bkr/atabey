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
import nodeTls from "tls";
import { URL } from "url";
import { resolveOutboundTlsOptions } from "../security/tls.js";

export interface OutboundRequestInput {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
    /** Max response body bytes to buffer (default 5 MiB). */
    maxBytes?: number;
    /** Optional proxy URL to route request through. */
    proxyUrl?: string;
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

        const handleResponse = (res: http.IncomingMessage) => {
            const chunks: Buffer[] = [];
            let size = 0;
            res.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (size <= maxBytes) {
                    chunks.push(chunk);
                } else {
                    res.destroy(new Error(`Response exceeded maximum size of ${maxBytes} bytes`));
                }
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
        };

        const finishRequest = (req: http.ClientRequest) => {
            const timeoutMs = input.timeoutMs ?? 30000;
            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Outbound request timed out after ${timeoutMs}ms`));
            });
            req.on("error", reject);
            if (input.body !== undefined) req.write(input.body);
            req.end();
        };

        // ── Proxy routing (previously accepted but silently ignored) ──────
        if (input.proxyUrl) {
            let proxy: URL;
            try {
                proxy = new URL(input.proxyUrl);
            } catch {
                reject(new Error(`Invalid proxy URL: ${input.proxyUrl}`));
                return;
            }
            if (proxy.protocol !== "http:" && proxy.protocol !== "https:") {
                reject(new Error(`Proxy protocol '${proxy.protocol}' not supported (only http/https proxies).`));
                return;
            }
            const proxyHeaders: Record<string, string> = {};
            if (proxy.username || proxy.password) {
                const creds = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
                proxyHeaders["Proxy-Authorization"] = "Basic " + Buffer.from(creds).toString("base64");
            }
            const proxyPort = Number(proxy.port) || (proxy.protocol === "https:" ? 443 : 80);
            const proxyMod = proxy.protocol === "https:" ? https : http;

            if (!isHttps) {
                // Plain HTTP target: forward the absolute-form URI via the proxy.
                const req = proxyMod.request({
                    protocol: proxy.protocol,
                    hostname: proxy.hostname,
                    port: proxyPort,
                    path: input.url,
                    method: requestOptions.method,
                    headers: { ...proxyHeaders, ...(requestOptions.headers as Record<string, string>) },
                }, handleResponse);
                finishRequest(req);
                return;
            }

            // HTTPS target: establish a CONNECT tunnel, then run TLS over it.
            const connectReq = proxyMod.request({
                protocol: proxy.protocol,
                hostname: proxy.hostname,
                port: proxyPort,
                method: "CONNECT",
                path: `${parsed.hostname}:${parsed.port || 443}`,
                headers: proxyHeaders,
            });
            connectReq.once("connect", (res: http.IncomingMessage, socket: import("net").Socket) => {
                if (res.statusCode !== 200) {
                    socket.destroy();
                    reject(new Error(`Proxy CONNECT failed with status ${res.statusCode}`));
                    return;
                }
                const req = https.request({
                    ...requestOptions,
                    agent: false,
                    createConnection: () => nodeTls.connect({
                        socket,
                        servername: parsed.hostname,
                        ...(tls?.options ?? {}),
                    }),
                }, handleResponse);
                finishRequest(req);
            });
            connectReq.once("error", reject);
            connectReq.end();
            return;
        }

        const mod = isHttps ? https : http;
        finishRequest(mod.request(requestOptions, handleResponse));
    });
}
