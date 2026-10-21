import { maskText } from "../../../shared/pii.js";
import { outboundRequest } from "atabey-shared/outbound-http.js";
import { Metrics } from "../../utils/metrics.js";
import { HttpProxyRequestArgs, ToolResult } from "../types.js";

// ─── CACHE STORAGE ──────────────────────────────────────────────────────────
interface CacheEntry {
    responseText: string;
    statusCode: number;
    contentType: string;
    timestamp: number;
}

const requestCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache lifetime

function getCacheKey(url: string, method: string, body?: string): string {
    return `${method.toUpperCase()}:${url}:${body || ""}`;
}

// ─── RATE LIMITER ───────────────────────────────────────────────────────────
const requestTimestamps: number[] = [];
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour sliding window
const MAX_REQUESTS_PER_WINDOW = 50; // Maximum 50 requests per hour

function checkRateLimit(): boolean {
    const now = Date.now();
    // Filter out timestamps older than the window
    while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW_MS) {
        requestTimestamps.shift();
    }
    return requestTimestamps.length < MAX_REQUESTS_PER_WINDOW;
}

// ─── HTML TEXT EXTRACTOR (TOKEN ECONOMY OPTIMIZATION) ───────────────────────
function cleanHtmlContent(html: string): string {
    // 1. Remove script, style, header, footer, and navigation blocks entirely
    let clean = html.replace(/<(script|style|header|footer|nav)\b[^>]*>([\s\S]*?)<\/\1>/gi, "");
    
    // 2. Replace formatting/block tags with newlines to preserve basic structure
    clean = clean.replace(/<(p|br|div|h[1-6]|li|tr)\b[^>]*>/gi, "\n");
    
    // 3. Strip all other HTML tags
    clean = clean.replace(/<[^>]*>/g, "");
    
    // 4. Decode common HTML entities
    clean = clean.replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, "\"")
        .replace(/&#39;/g, "'");

    // 5. Clean up redundant spaces and blank lines
    return clean.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join("\n");
}

function isTestEnv(): boolean {
    return process.env.VITEST === "true" || process.env.NODE_ENV === "test";
}

/** Parse decimal / hex / dotted (octal octets) IPv4 representations to octets. */
function parseIpv4(host: string): number[] | null {
    const h = host.trim().toLowerCase();
    if (/^\d+$/.test(h)) {
        const n = Number(h);
        if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
        return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    }
    if (/^0x[0-9a-f]+$/.test(h)) {
        const n = parseInt(h, 16);
        if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
        return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
    }
    const parts = h.split(".");
    if (parts.length !== 4) return null;
    const octets = parts.map((p) => {
        if (/^0x[0-9a-f]+$/.test(p)) return parseInt(p, 16);
        if (/^0[0-7]+$/.test(p)) return parseInt(p, 8);
        if (/^\d+$/.test(p)) return parseInt(p, 10);
        return NaN;
    });
    if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
    return octets;
}

function isPrivateIpv4(o: number[]): boolean {
    const test = isTestEnv();
    if (o[0] === 127) return !test;               // loopback
    if (o[0] === 10) return true;                 // 10/8
    if (o[0] === 169 && o[1] === 254) return true; // link-local / cloud metadata
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true; // 172.16/12
    if (o[0] === 192 && o[1] === 168) return true; // 192.168/16
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return true; // CGNAT 100.64/10
    if (o[0] === 0) return true;                  // 0.0.0.0/8
    return false;
}

/** True for private / loopback / link-local IPs (IPv4 and IPv6). */
function isPrivateIp(ip: string): boolean {
    const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "");
    if (raw === "localhost" || raw.endsWith(".localhost")) return !isTestEnv();
    if (raw.includes(":")) {
        if (raw === "::1" || raw === "::") return !isTestEnv();
        if (raw.startsWith("fe80") || raw.startsWith("fc") || raw.startsWith("fd")) return true;
        if (raw.startsWith("::ffff:")) {
            const mapped = parseIpv4(raw.slice(7));
            return mapped ? isPrivateIpv4(mapped) : false;
        }
        return false;
    }
    const o = parseIpv4(raw);
    return o ? isPrivateIpv4(o) : false;
}

/**
 * SSRF guard: reject private/loopback/link-local targets, including decimal /
 * octal / hex IP encodings and DNS names that resolve to private addresses.
 * Returns a human-readable reason, or null when the host is safe.
 */
async function checkHostIsPublic(hostname: string): Promise<string | null> {
    const raw = hostname.toLowerCase().trim().replace(/^\[|\]$/g, "");
    if (raw.endsWith(".local") || raw.endsWith(".internal")) {
        return "private/internal hostname";
    }
    if (isPrivateIp(raw)) {
        return "private, local, or cloud metadata endpoint";
    }
    // Plain IP literal — the check above is authoritative.
    if (parseIpv4(raw) || raw.includes(":")) return null;
    // DNS name — resolve and verify every address (blocks nip.io style tricks).
    try {
        const dns = await import("dns");
        const addresses = await dns.promises.lookup(raw, { all: true });
        for (const a of addresses) {
            if (isPrivateIp(a.address)) {
                return `hostname resolves to private address ${a.address}`;
            }
        }
    } catch {
        return "hostname could not be resolved";
    }
    return null;
}

/**
 * MCP HTTP Proxy Tool with:
 * - SSRF Protection (restricting private IPs and metadata services)
 * - Caching (GET requests cached for 5 minutes)
 * - HTML Content Extraction (stripping boilerplate to save tokens)
 * - Rate Limiting (preventing infinite request loops and high API costs)
 * - PII Masking (compliance under KVKK and GDPR)
 */
export async function handleHttpProxyRequest(projectRoot: string, args: HttpProxyRequestArgs): Promise<ToolResult> {
    const { url, method, headers, body, proxyUrl } = args;

    if (!url) {
        const err = "Missing 'url' argument.";
        Metrics.logError(projectRoot, "@mcp", "http_proxy_request", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        const err = `Invalid URL provided: ${url}`;
        Metrics.logError(projectRoot, "@mcp", "http_proxy_request", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        const err = `Protocol '${parsedUrl.protocol}' not supported. Only http: and https: are allowed.`;
        Metrics.logError(projectRoot, "@mcp", "http_proxy_request", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    const ssrfReason = await checkHostIsPublic(parsedUrl.hostname);
    if (ssrfReason) {
        const err = `SSRF Protection: Requests to ${parsedUrl.hostname} are prohibited (${ssrfReason}).`;
        Metrics.logError(projectRoot, "@mcp", "http_proxy_request:ssrf", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    const reqMethod = (method || "GET").toUpperCase();

    // 1. ENFORCE RATE LIMITING
    if (!checkRateLimit()) {
        const err = `Rate limit exceeded. Maximum ${MAX_REQUESTS_PER_WINDOW} external requests per hour allowed to prevent token and cost bloat.`;
        Metrics.logError(projectRoot, "@mcp", "http_proxy_request:rate_limit", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }

    // 2. CHECK CACHE (Only for GET requests)
    const cacheKey = getCacheKey(url, reqMethod, body);
    if (reqMethod === "GET") {
        const cached = requestCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
            // Mask cached response for KVKK compliance
            const sanitizedCached = maskText(cached.responseText);
            const tokens = Metrics.estimateTokens(sanitizedCached);
            Metrics.logUsage(projectRoot, "@mcp", `http_proxy_request:cache_hit ${url}`, tokens);
            return {
                content: [{
                    type: "text",
                    text: `[OK - Cached Response (TTL remaining: ${Math.round((CACHE_TTL_MS - (Date.now() - cached.timestamp)) / 1000)}s)]\n${sanitizedCached}`
                }]
            };
        }
    }

    // Add current request to rate limiter window
    requestTimestamps.push(Date.now());

    try {
        const requestHeaders: Record<string, string> = {
            "User-Agent": "Atabey-MCP-Client/1.0",
            "Accept": "application/json, text/html, text/plain, */*",
            ...(headers || {})
        };

        const requestBody = body && (reqMethod === "POST" || reqMethod === "PUT" || reqMethod === "DELETE") ? body : undefined;

        let responseText = "";
        let statusCode = 200;
        let contentType = "text/plain";

        try {
            let currentUrl = url;
            let response: import("atabey-shared/outbound-http.js").OutboundResponse | undefined;
            let redirectCount = 0;
            const MAX_REDIRECTS = 5;

            while (true) {
                const stepUrl = new URL(currentUrl);
                if (stepUrl.protocol !== "http:" && stepUrl.protocol !== "https:") {
                    throw new Error(`Protocol '${stepUrl.protocol}' not supported. Only http: and https: are allowed.`);
                }
                const stepReason = await checkHostIsPublic(stepUrl.hostname);
                if (stepReason) {
                    throw new Error(`SSRF Protection: Requests to ${stepUrl.hostname} are prohibited (${stepReason}).`);
                }

                response = await outboundRequest({
                    url: currentUrl,
                    method: reqMethod,
                    headers: requestHeaders,
                    body: requestBody,
                    proxyUrl,
                });

                if ([301, 302, 303, 307, 308].includes(response.status)) {
                    redirectCount++;
                    if (redirectCount > MAX_REDIRECTS) {
                        throw new Error(`Too many redirects (max ${MAX_REDIRECTS}).`);
                    }
                    const location = response.location;
                    if (!location) {
                        break;
                    }
                    currentUrl = new URL(location, currentUrl).toString();
                    continue;
                }
                break;
            }

            statusCode = response ? response.status : 500;
            responseText = response ? response.text : "";
            const ct = response?.headers["content-type"];
            contentType = (Array.isArray(ct) ? ct[0] : ct) || "text/plain";
        } catch (fetchErr) {
            const err = `Fetch failed: ${(fetchErr as Error).message}`;
            Metrics.logError(projectRoot, "@mcp", "http_proxy_request:fetch", err);
            return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
        }

        // 3. OPTIMIZE TOKEN ECONOMY: Strip HTML markup if content-type is HTML
        let processedResponse = responseText;
        if (contentType.toLowerCase().includes("text/html")) {
            processedResponse = cleanHtmlContent(responseText);
        }

        // 4. ENFORCE COMPLIANCE: Mask PII and sensitive data in response body
        const sanitizedResponse = maskText(processedResponse);

        // Save to cache if successful GET request
        if (reqMethod === "GET" && statusCode === 200) {
            requestCache.set(cacheKey, {
                responseText: sanitizedResponse,
                statusCode,
                contentType,
                timestamp: Date.now()
            });
        }

        const tokens = Metrics.estimateTokens(sanitizedResponse);
        Metrics.logUsage(projectRoot, "@mcp", `http_proxy_request:fetch ${url}`, tokens);

        if (statusCode >= 400) {
            return {
                isError: true,
                content: [{
                    type: "text",
                    text: `[ERROR] HTTP Request failed with status ${statusCode}.\nResponse: ${sanitizedResponse}`
                }]
            };
        }

        return {
            content: [{
                type: "text",
                text: sanitizedResponse
            }]
        };

    } catch (e) {
        const err = `HTTP Request failed: ${String(e)}`;
        Metrics.logError(projectRoot, "@mcp", "http_proxy_request", err);
        return { isError: true, content: [{ type: "text", text: `[ERROR] ${err}` }] };
    }
}
