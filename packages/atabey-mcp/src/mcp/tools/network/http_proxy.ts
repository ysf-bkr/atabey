import { maskText } from "../../../shared/pii.js";
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

/**
 * MCP HTTP Proxy Tool with:
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
            "User-Agent": "Agent-Atabey-MCP-Client/1.0",
            "Accept": "application/json, text/html, text/plain, */*",
            ...(headers || {})
        };

        const fetchOptions: RequestInit = {
            method: reqMethod,
            headers: requestHeaders,
        };

        if (body && (reqMethod === "POST" || reqMethod === "PUT" || reqMethod === "DELETE")) {
            fetchOptions.body = body;
        }

        // Handle proxy configuration natively by temporarily setting standard env vars
        const originalHttpProxy = process.env.HTTP_PROXY;
        const originalHttpsProxy = process.env.HTTPS_PROXY;
        
        if (proxyUrl) {
            process.env.HTTP_PROXY = proxyUrl;
            process.env.HTTPS_PROXY = proxyUrl;
        }

        let responseText = "";
        let statusCode = 200;
        let contentType = "text/plain";

        try {
            const response = await fetch(url, fetchOptions);
            statusCode = response.status;
            responseText = await response.text();
            contentType = response.headers.get("content-type") || "text/plain";
        } finally {
            if (proxyUrl) {
                if (originalHttpProxy !== undefined) {
                    process.env.HTTP_PROXY = originalHttpProxy;
                } else {
                    delete process.env.HTTP_PROXY;
                }
                if (originalHttpsProxy !== undefined) {
                    process.env.HTTPS_PROXY = originalHttpsProxy;
                } else {
                    delete process.env.HTTPS_PROXY;
                }
            }
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
